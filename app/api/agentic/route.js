import { NextResponse } from "next/server";
import { DEFAULT_STATE } from "../../data/fundState.js";

export const maxDuration = 60;
const API_KEY = process.env.ANTHROPIC_API_KEY;

// ═══ KV ═══
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}
async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try { const r = await fetch(`${url}/set/${key}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) }); return r.ok; } catch { return false; }
}

// ═══ TELEGRAM ═══
async function tg(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4096), parse_mode: "Markdown", disable_web_page_preview: true }) }); } catch {}
}

// ═══ CLAUDE ═══
async function askClaude(system, userMsg, maxTokens = 800) {
  if (!API_KEY) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages: [{ role: "user", content: userMsg }] }),
    });
    const d = await r.json();
    return d.content?.[0]?.text || null;
  } catch { return null; }
}

// ═══ PATTERN DETECTORS ═══

// Pattern 1: Position momentum shift (>5% move)
async function detectMomentumShift(state, prices, lastPrices) {
  const alerts = [];
  for (const pos of (state.positions || [])) {
    const now = prices[pos.id]?.price;
    const last = lastPrices?.[pos.id]?.price;
    if (!now || !last) continue;
    const movePct = ((now - last) / last) * 100;
    if (Math.abs(movePct) >= 3) {
      alerts.push({
        type: "MOMENTUM_SHIFT",
        ticker: pos.id,
        move_pct: movePct.toFixed(2),
        current: now,
        previous: last,
        direction: pos.direction,
        thesis: pos.thesis,
      });
    }
  }
  return alerts;
}

// Pattern 2: Gap risk (position near stop or gapped overnight)
function detectGapRisk(state, prices) {
  const alerts = [];
  for (const pos of (state.positions || [])) {
    const p = prices[pos.id];
    if (!p?.price || !pos.stop) continue;
    const dir = (pos.direction || "buy").toLowerCase();
    const breached = dir === "buy" ? p.price < pos.stop : p.price > pos.stop;
    if (breached) {
      alerts.push({
        type: "STOP_BREACHED",
        ticker: pos.id,
        price: p.price,
        stop: pos.stop,
        gap: ((p.price - p.prevClose) / p.prevClose * 100).toFixed(2),
      });
    }
  }
  return alerts;
}

// Pattern 3: VIX spike (risk-off)
async function detectVixSpike(prices, history) {
  if (!prices?.VIX?.price || !history?.vix) return [];
  const last = history.vix;
  const now = prices.VIX.price;
  const spike = ((now - last) / last) * 100;
  if (spike > 15) return [{ type: "VIX_SPIKE", previous: last, current: now, spike_pct: spike.toFixed(1) }];
  return [];
}

// Pattern 4: Scanner found high-conviction opportunity
async function detectHighConvictionSignal(req) {
  try {
    const auth = req.headers.get("x-apex-key");
    const origin = new URL(req.url).origin;
    const r = await fetch(`${origin}/api/scanner`, { headers: { "x-apex-key": auth } });
    const d = await r.json();
    const top = (d.top5 || []).filter(t => t.score >= 80);
    if (top.length) {
      return top.map(t => ({
        type: "HIGH_CONVICTION_OPPORTUNITY",
        ticker: t.ticker,
        score: t.score,
        price: t.price,
        changePct: t.changePct,
      }));
    }
  } catch {}
  return [];
}

// Pattern 5: Peace signal state change
async function detectSignalChange(state, lastSignals) {
  if (!state.signals || !lastSignals) return [];
  const now = state.signals.total || 0;
  const was = lastSignals.total || 0;
  if (Math.abs(now - was) >= 1) {
    return [{
      type: "PEACE_SIGNAL_CHANGE",
      from: was,
      to: now,
      trigger: state.signals.trigger,
      armed: now >= (state.signals.trigger || 3),
    }];
  }
  return [];
}

// ═══ MAIN AGENTIC LOOP ═══
export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startTime = Date.now();
  try {
    // Load current state
    const state = await kvGet("apex:state") || DEFAULT_STATE;
    const origin = new URL(req.url).origin;

    // Fetch current prices
    const pricesResp = await fetch(`${origin}/api/prices`, { headers: { "x-apex-key": auth } });
    const pricesData = await pricesResp.json();
    const prices = pricesData.prices || {};

    // Load last observation
    const lastObs = await kvGet("apex:last_observation") || {};

    // Run all detectors in parallel
    const [momentum, gap, vix, scanner, signals] = await Promise.all([
      detectMomentumShift(state, prices, lastObs.prices),
      detectGapRisk(state, prices),
      detectVixSpike(prices, { vix: lastObs.prices?.VIX?.price }),
      detectHighConvictionSignal(req),
      detectSignalChange(state, lastObs.signals),
    ]);

    const allAlerts = [...momentum, ...gap, ...vix, ...scanner, ...signals];

    // Save current observation for next run
    await kvSet("apex:last_observation", {
      timestamp: new Date().toISOString(),
      prices: { VIX: prices.VIX, SPX: prices.SPX, BRENT: prices.BRENT, ...Object.fromEntries((state.positions || []).map(p => [p.id, prices[p.id]])) },
      signals: state.signals,
    });

    // If no alerts, done
    if (!allAlerts.length) {
      return NextResponse.json({ alerts: [], checked_patterns: 5, elapsed_ms: Date.now() - startTime });
    }

    // Generate Claude-powered judgment for each alert
    const judgments = [];
    for (const alert of allAlerts.slice(0, 5)) { // Cap at 5 per run to control cost
      const context = `Fund: Apex Macro, NAV £${state.account?.nav}, Day ${Math.floor((Date.now() - new Date(state.account?.inception_date || "2026-03-17").getTime()) / 86400000)}.
Positions: ${(state.positions || []).map(p => `${p.id} ${p.direction} ${p.units}u @ $${p.entry_price} stop $${p.stop} T1 $${p.t1} [${p.thesis}]`).join("; ")}
Alert: ${JSON.stringify(alert)}`;

      const judgment = await askClaude(
        "You are APEX. Analyze this real-time alert and give the PM a 2-3 sentence actionable assessment. Start with severity: 🔴 CRITICAL / 🟡 WARNING / 🟢 INFO. Be specific. Reference the position/thesis/rule. Suggest ONE action.",
        context,
        400
      );

      if (judgment) {
        judgments.push({ alert, judgment });
        await tg(`🧠 *APEX AUTO-ANALYSIS*\n\n*${alert.type}* — ${alert.ticker || ""}\n\n${judgment}`);
      }
    }

    // Queue judgments for UI pickup
    let queue = await kvGet("apex:agentic_queue") || [];
    for (const j of judgments) {
      queue.push({ timestamp: new Date().toISOString(), alert: j.alert, judgment: j.judgment, seen: false });
    }
    queue = queue.slice(-50);
    await kvSet("apex:agentic_queue", queue);

    // Log run
    let runs = await kvGet("apex:agentic_runs") || [];
    runs.push({ timestamp: new Date().toISOString(), alerts_found: allAlerts.length, judgments: judgments.length, elapsed_ms: Date.now() - startTime });
    runs = runs.slice(-100);
    await kvSet("apex:agentic_runs", runs);

    return NextResponse.json({
      alerts_detected: allAlerts.length,
      judgments_generated: judgments.length,
      judgments,
      elapsed_ms: Date.now() - startTime,
    });
  } catch (err) {
    console.error("Agentic error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const queue = await kvGet("apex:agentic_queue") || [];
  const runs = await kvGet("apex:agentic_runs") || [];
  return NextResponse.json({ queue, runs: runs.slice(-20), queue_count: queue.length });
}
