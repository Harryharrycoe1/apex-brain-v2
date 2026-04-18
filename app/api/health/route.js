import { NextResponse } from "next/server";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { BRAINSTEM } from "../../data/brainstem.js";
import { PATHWAYS } from "../../data/pathways.js";
import { WATCHLIST } from "../../data/algoConfig.js";
export const maxDuration = 30;

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}

async function checkYahoo() { try { const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d", { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }); if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }; const d = await r.json(); return { ok: !!d?.chart?.result?.[0]?.meta?.regularMarketPrice, price: d?.chart?.result?.[0]?.meta?.regularMarketPrice, latency: "5s OK" }; } catch (e) { return { ok: false, error: e.message }; } }

async function checkAnthropic() { if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No key" }; try { const start = Date.now(); const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 5, messages: [{ role: "user", content: "ping" }] }) }); return { ok: r.ok, status: r.status, latency_ms: Date.now() - start }; } catch (e) { return { ok: false, error: e.message }; } }

async function checkTelegram() { if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, error: "Not configured" }; try { const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`); const d = await r.json(); return d.ok ? { ok: true, bot: d.result.username } : { ok: false, error: d.description }; } catch (e) { return { ok: false, error: e.message }; } }

async function checkUpstash() { const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN; if (!url || !token) return { ok: false, error: "Not configured" }; try { const start = Date.now(); const r = await fetch(`${url}/ping`, { headers: { Authorization: `Bearer ${token}` } }); return { ok: r.ok, latency_ms: Date.now() - start }; } catch (e) { return { ok: false, error: e.message }; } }

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checks = [];
  const pass = (n, d) => checks.push({ name: n, status: "GREEN", detail: d });
  const warn = (n, d) => checks.push({ name: n, status: "AMBER", detail: d });
  const fail = (n, d) => checks.push({ name: n, status: "RED", detail: d });

  // ═══ ENV VARIABLES ═══
  ["ANTHROPIC_API_KEY", "APEX_ACCESS_KEY", "KV_REST_API_URL", "KV_REST_API_TOKEN"].forEach(k => process.env[k] ? pass(`ENV:${k}`, "Set") : fail(`ENV:${k}`, "Missing"));
  ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"].forEach(k => process.env[k] ? pass(`ENV:${k}`, "Set") : warn(`ENV:${k}`, "Not configured"));
  pass("ENV:NODE_ENV", process.env.NODE_ENV || "unknown");
  pass("ENV:PORT", process.env.PORT || "3000");

  // ═══ DATA MODULES ═══
  pass("DATA:brainstem", `${BRAINSTEM.length} chars`);
  pass("DATA:pathways", `${Object.keys(PATHWAYS).length} neural pathways`);
  pass("DATA:watchlist", `${Object.keys(WATCHLIST).length} tickers`);

  // ═══ EXTERNAL APIs ═══
  const [yahoo, anth, tg, upstash] = await Promise.all([checkYahoo(), checkAnthropic(), checkTelegram(), checkUpstash()]);
  yahoo.ok ? pass("API:yahoo", `AAPL=$${yahoo.price} (${yahoo.latency})`) : fail("API:yahoo", yahoo.error);
  anth.ok ? pass("API:anthropic", `${anth.latency_ms}ms (Sonnet 4)`) : fail("API:anthropic", anth.error || `HTTP ${anth.status}`);
  tg.ok ? pass("API:telegram", `@${tg.bot}`) : warn("API:telegram", tg.error);
  upstash.ok ? pass("API:upstash", `${upstash.latency_ms}ms`) : fail("API:upstash", upstash.error);

  // ═══ KV STATE ═══
  const kvState = await kvGet("apex:state");
  if (kvState) {
    pass("KV:state", `${(kvState.positions || []).length} open pos / 10 slots`);
    pass("KV:closed", `${(kvState.closed || []).length} closed trades`);
    pass("KV:strategy_log", `${(kvState.strategy_log || []).length} entries`);
    pass("KV:active_pipeline", `${(kvState.active_pipeline || []).length} opportunities`);
    pass("KV:nav", `£${(kvState.account?.nav || 0).toFixed(2)} (deposited: £${(kvState.account?.total_deposited || 0).toFixed(2)})`);
    if (kvState.account?.last_updated) {
      const hrs = Math.floor((Date.now() - new Date(kvState.account.last_updated).getTime()) / 3600000);
      hrs > 12 ? warn("KV:staleness", `${hrs}h since update`) : pass("KV:staleness", `Updated ${hrs}h ago`);
    }
  } else { warn("KV:state", "Empty"); }

  // ═══ SCANNER STATE ═══
  const lastScan = await kvGet("apex:last_scan");
  if (lastScan) {
    const scanAgeMin = Math.floor((Date.now() - new Date(lastScan.updated || lastScan.timestamp).getTime()) / 60000);
    scanAgeMin > 30 ? warn("SCANNER:last_run", `${scanAgeMin}min ago`) : pass("SCANNER:last_run", `${scanAgeMin}min ago`);
    pass("SCANNER:universe", `${lastScan.universe_size || 0} tickers`);
    pass("SCANNER:passing_rr", `${lastScan.passing_rr || 0} valid setups`);
    if (lastScan.ai_judgments != null) pass("SCANNER:ai_judge", `${lastScan.ai_judgments} judged, ${lastScan.ai_vetoes || 0} vetoed, ${lastScan.ai_errors || 0} errors`);
    // V5.0: flag if bad data is being detected
    if (lastScan.suspect_data_tickers?.length) warn("SCANNER:suspect_data", `${lastScan.suspect_data_tickers.length} tickers flagged: ${lastScan.suspect_data_tickers.slice(0, 5).join(", ")}`);
    lastScan.rejected_rr > 0 && pass("SCANNER:rejected_rr", `${lastScan.rejected_rr} rejected on R:R`);
  } else { warn("SCANNER:state", "Not run yet"); }

  // ═══ REGIME DETECTION ═══
  // V5.0 FIX C2: regime stored FLAT at apex:regime, not nested under `current`.
  const regime = await kvGet("apex:regime");
  if (regime?.primary_code) {
    pass("REGIME:current", `${regime.primary_code} (${regime.confidence || "?"}% conf)`);
    if (regime.timestamp) {
      const hrs = Math.floor((Date.now() - new Date(regime.timestamp).getTime()) / 3600000);
      hrs > 6 ? warn("REGIME:last_detection", `${hrs}h ago`) : pass("REGIME:last_detection", `${hrs}h ago`);
    }
  } else { warn("REGIME:current", "Not detected yet"); }

  // ═══ PEACE SIGNAL ═══
  // V5.0 FIX C5: peace signal now lives at apex:peace_signal (written by altdata route).
  // Old code read kvState.signals which is only populated manually via update_signals.
  const peaceSignal = await kvGet("apex:peace_signal");
  if (peaceSignal) {
    const score = peaceSignal.score || 0;
    const ageHrs = peaceSignal.timestamp ? Math.floor((Date.now() - new Date(peaceSignal.timestamp).getTime()) / 3600000) : null;
    if (score >= 3) warn("PEACE:score", `${score}/8 — EXIT ARMED`);
    else pass("PEACE:score", `${score}/8`);
    if (ageHrs != null) {
      ageHrs > 8 ? warn("PEACE:freshness", `${ageHrs}h old`) : pass("PEACE:freshness", `${ageHrs}h ago`);
    }
  } else {
    warn("PEACE:state", "altdata cron has not populated peace signal yet");
  }

  // ═══ ADAPTIVE LEARNING ═══
  // V5.0 FIX C5: correct key is apex:learning (not apex:adaptive_learning).
  const learning = await kvGet("apex:learning");
  if (learning) {
    const samples = learning.sample_size || 0;
    samples >= 10 ? pass("LEARNING:samples", `${samples} trades analysed`) : warn("LEARNING:samples", `${samples} trades (need 10+ for signal)`);
    if (learning.brier_score != null) {
      const brier = learning.brier_score;
      brier < 0.2 ? pass("LEARNING:brier", `${brier.toFixed(3)} (well-calibrated)`)
        : brier < 0.25 ? pass("LEARNING:brier", `${brier.toFixed(3)} (decent)`)
        : warn("LEARNING:brier", `${brier.toFixed(3)} (uncalibrated)`);
    }
    if (learning.accuracy != null) pass("LEARNING:accuracy", `${learning.accuracy}% win rate`);
  } else { warn("LEARNING:state", "No data yet — close trades to populate"); }

  // ═══ STRATEGY ENGINE ═══
  const strategy = await kvGet("apex:strategy_recommendations");
  strategy ? pass("STRATEGY:cache", `${(strategy.recommendations || []).length} recommendations`) : warn("STRATEGY:cache", "Not computed yet");

  // ═══ PRICE ERRORS ═══
  const priceErrors = await kvGet("apex:price_errors") || [];
  const recentErrors = priceErrors.filter(e => (Date.now() - new Date(e.timestamp).getTime()) < 86400000);
  recentErrors.length > 5 ? warn("PRICES:errors_24h", `${recentErrors.length} errors`) : pass("PRICES:errors_24h", `${recentErrors.length} errors`);

  // ═══ RUNTIME ═══
  const mem = process.memoryUsage();
  const memMB = Math.round(mem.heapUsed / 1024 / 1024);
  memMB > 400 ? warn("RUNTIME:memory", `${memMB}MB heap`) : pass("RUNTIME:memory", `${memMB}MB heap`);
  pass("RUNTIME:uptime", `${Math.floor(process.uptime() / 60)}min`);
  pass("RUNTIME:node", process.version);

  // ═══ SUMMARY ═══
  const green = checks.filter(c => c.status === "GREEN").length;
  const amber = checks.filter(c => c.status === "AMBER").length;
  const red = checks.filter(c => c.status === "RED").length;

  const readable = [
    `APEX BRAIN V5.0 HEALTH CHECK`,
    `${green}/${checks.length} GREEN | ${amber} AMBER | ${red} RED`,
    `Overall: ${red > 0 ? "DEGRADED" : amber > 0 ? "HEALTHY (warnings)" : "ALL GREEN"}`,
    "", ...checks.map(c => `${c.status === "GREEN" ? "✅" : c.status === "AMBER" ? "🟡" : "🔴"} ${c.name}: ${c.detail}`)
  ].join("\n");

  const grouped = {};
  for (const c of checks) {
    const cat = c.name.split(":")[0];
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  }

  return NextResponse.json({
    checks, grouped, green, amber, red, total: checks.length, readable,
    price_errors_24h: recentErrors.length,
    strategy_log_count: (kvState?.strategy_log || []).length,
    memory_mb: memMB,
    uptime_seconds: Math.floor(process.uptime()),
    node_version: process.version,
    last_scan: lastScan ? {
      updated: lastScan.updated || lastScan.timestamp,
      scanned: lastScan.scanned,
      universe_size: lastScan.universe_size,
      passing_rr: lastScan.passing_rr,
      rejected_rr: lastScan.rejected_rr,
      rejected_confidence: lastScan.rejected_confidence,
      blocked_earnings: lastScan.blocked_earnings,
      fetch_errors: lastScan.fetch_errors,
      suspect_data: lastScan.suspect_data_tickers,
      dismissed_count: lastScan.dismissed_count,
      healing_applied: lastScan.healing_applied,
      ai_judgments: lastScan.ai_judgments,
      ai_vetoes: lastScan.ai_vetoes,
    } : null,
    regime_current: regime || null,
    peace_signal: peaceSignal || null,
    timestamp: new Date().toISOString(),
  });
}
