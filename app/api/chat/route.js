import { NextResponse } from "next/server";
import { BRAINSTEM, AMYGDALA_PREAMBLE } from "../../data/brainstem.js";
import { ROUTER_PROMPT } from "../../data/router.js";
import { PATHWAYS } from "../../data/pathways.js";
import { getCortexSections } from "../../data/cortex.js";
import { AMYGDALA_PROMPT } from "../../data/amygdala.js";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";

export const maxDuration = 120;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function $(v, d = 2) { const n = Number(v); return isFinite(n) ? n.toFixed(d) : "—"; }

// ═══ DIRECTION-AWARE P&L ═══
function plPerUnit(entry, current, direction) {
  const dir = (direction || "buy").toLowerCase();
  return (dir === "short" || dir === "sell") ? entry - current : current - entry;
}

// ═══ FAST PATH — zero API cost ═══
function tryFastPath(userMsg, state, prices) {
  const l = userMsg.toLowerCase().trim();
  const p = prices || {};
  // Price query
  const tm = l.match(/(?:what(?:'s| is)|price (?:of|for)|how (?:much )?is)\s+(\w+)/);
  const jt = l.match(/^(\w{1,5})(?:\s*(?:price|\?)?\s*)$/i);
  const ticker = (tm?.[1] || jt?.[1] || "").toUpperCase();
  if (ticker && p[ticker]?.price != null) {
    const c = ["IAG","BAE"].includes(ticker) ? "£" : "$";
    return { content: `**${ticker}:** ${c}${$(p[ticker].price)} (${p[ticker].changePct >= 0 ? "+" : ""}${p[ticker].changePct}% today)`, pathway: "fast_path" };
  }
  // NAV
  if (l.match(/^(?:what(?:'s| is) (?:my |the )?)?(?:nav|account|balance)/)) {
    const a = state?.account;
    if (a) return { content: `**NAV:** £${$(a.nav)} | **Cash:** £${$(a.cash)} | **Margin:** £${$(a.margin_used)} | **Health:** ${a.margin_health_pct}%\n**Deposited:** £${a.total_deposited} | **Realised:** +£${$(a.total_realised_pl)}`, pathway: "fast_path" };
  }
  // Positions
  if (l.match(/^(?:what(?:'s| are) (?:my |the )?)?(?:positions?|book|holdings?)/)) {
    const pos = state?.positions || [];
    if (pos.length) {
      const lines = pos.map(pp => {
        const lp = p[pp.id]?.price;
        const c = pp.currency === "GBP" ? "£" : "$";
        const dir = (pp.direction || "buy").toUpperCase();
        const ps = lp != null ? ` → ${c}${$(lp)}` : "";
        return `**${pp.id}** [${pp.sleeve}/${dir}] ${pp.units}u @ ${c}${pp.entry_price}${ps}`;
      });
      return { content: `**${pos.length} open positions:**\n${lines.join("\n")}`, pathway: "fast_path" };
    }
  }
  // Peace score
  if (l.match(/(?:peace|signal).*(?:score|status)/)) {
    const s = state?.signals;
    if (s) return { content: `**Peace Signal Score:** ${s.total}/8 (trigger ≥${s.trigger}) — ${s.total >= s.trigger ? "EXIT SEQUENCE ARMED" : "Below trigger"}`, pathway: "fast_path" };
  }
  return null;
}

// ═══ CLAUDE API ═══
async function callClaude(system, messages, useWebSearch = false, maxTokens = 4096) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const body = { model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages };
  if (system) body.system = system;
  if (useWebSearch) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const raw = await resp.text();
  let data; try { data = JSON.parse(raw); } catch { throw new Error("Anthropic returned non-JSON. Try again in 60s."); }
  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Rate limited. Wait 60 seconds.");
    if (resp.status === 529) throw new Error("Anthropic overloaded. Wait 30 seconds.");
    if (resp.status === 401) throw new Error("Invalid API key.");
    throw new Error(data?.error?.message || `API error ${resp.status}`);
  }
  return { text: (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n"), raw: data };
}

// ═══ KV HELPERS ═══
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = await r.json();
    let val = d.result;
    for (let i = 0; i < 3; i++) { if (typeof val === "string") { try { val = JSON.parse(val); } catch { break; } } else break; }
    return val;
  } catch { return null; }
}

// ═══ YAHOO PRICES (direct — no self-call) ═══
async function fetchYahooPrice(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    let price = Number(meta.regularMarketPrice);
    let prev = Number(meta.chartPreviousClose || meta.previousClose) || price;
    if (PENCE_SYMBOLS.includes(symbol)) { price /= 100; prev /= 100; }
    if (!isFinite(price)) return null;
    return { price, changePct: parseFloat($(prev ? ((price - prev) / prev) * 100 : 0)), currency: PENCE_SYMBOLS.includes(symbol) ? "GBP" : meta.currency };
  } catch { return null; }
}

async function loadPrices(positions = []) {
  const tickers = { BRENT: "BZ=F", WTI: "CL=F", SPX: "^GSPC", VIX: "^VIX", GBPUSD: "GBPUSD=X" };
  // Dynamically add ALL held position tickers
  for (const pos of positions) {
    const id = pos.id?.toUpperCase();
    if (id && WATCHLIST[id]) tickers[id] = WATCHLIST[id].yahoo;
    else if (id) tickers[id] = id;
  }
  const results = {};
  const entries = Object.entries(tickers);
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    await Promise.all(batch.map(([k, s]) => fetchYahooPrice(s).then(d => { if (d) results[k] = d; })));
  }
  return results;
}

// ═══ FORMAT FUND CONTEXT ═══
function formatContext(state, prices, clientPrices) {
  if (!state) return "";
  const p = { ...prices, ...(clientPrices || {}) }; // Client prices override server
  const a = state.account;
  const gbp = Number(a?.gbp_usd) || 1.34;
  const lines = ["\n=== LIVE FUND STATE ==="];

  if (a) {
    lines.push(`NAV: £${$(a.nav)} | Cash: £${$(a.cash)} | Margin: £${$(a.margin_used)} | Health: ${a.margin_health_pct}%`);
    lines.push(`Deposited: £${a.total_deposited} | Realised: £${$(a.total_realised_pl)} | Return: ${$(((a.nav - a.total_deposited) / a.total_deposited) * 100, 1)}%`);
    lines.push(`Fund Day ${Math.floor((Date.now() - new Date(a.inception_date).getTime()) / 86400000)}`);
  }

  // Macro prices
  const macro = [];
  if (p.BRENT?.price) macro.push(`Brent: $${$(p.BRENT.price)} (${p.BRENT.changePct >= 0 ? "+" : ""}${p.BRENT.changePct}%)`);
  if (p.SPX?.price) macro.push(`S&P: ${$(p.SPX.price, 0)}`);
  if (p.VIX?.price) macro.push(`VIX: ${$(p.VIX.price, 1)}`);
  if (p.GBPUSD?.price) macro.push(`GBP/USD: ${$(p.GBPUSD.price, 4)}`);
  if (macro.length) lines.push(`MACRO: ${macro.join(" | ")}`);

  // Positions with P&L
  if (state.positions?.length) {
    lines.push(`\nOPEN POSITIONS (${state.positions.length}/10):`);
    let totalPL = 0;
    for (const pos of state.positions) {
      const lp = p[pos.id]?.price;
      const c = pos.currency === "GBP" ? "£" : "$";
      const dir = (pos.direction || "buy").toUpperCase();
      const st = pos.trailing_stop ? `trail ${c}${pos.trailing_stop}` : pos.stop ? `stop ${c}${pos.stop}` : "no stop";
      let ps = `entry ${c}${pos.entry_price}`, plStr = "";
      if (lp != null) {
        const pl = plPerUnit(pos.entry_price, lp, pos.direction) * pos.units;
        const plG = pos.currency === "GBP" ? pl : pl / gbp;
        totalPL += plG;
        ps = `${c}${$(lp)} (${$(((lp - pos.entry_price) / pos.entry_price) * 100, 1)}%)`;
        plStr = ` | P&L: ${plG >= 0 ? "+" : ""}£${$(plG)}`;
      }
      lines.push(`  ${pos.id} [${pos.sleeve}/${dir}] ${pos.units}u @ ${c}${pos.entry_price} → ${ps} | ${st} | T1:${c}${pos.t1}${plStr}`);
      if (pos.thesis) lines.push(`    Thesis: ${pos.thesis}`);
    }
    lines.push(`  TOTAL OPEN P&L: ${totalPL >= 0 ? "+" : ""}£${$(totalPL)}`);
  }

  if (state.closed?.length) { lines.push(`\nCLOSED (${state.closed.length}):`); for (const c of state.closed.slice(-5)) lines.push(`  ${c.ticker}: ${c.net_pl > 0 ? "+" : ""}£${c.net_pl} | ${c.reason}`); }
  if (state.signals) lines.push(`\nPEACE: ${state.signals.total}/8 (trigger≥${state.signals.trigger})`);
  if (state.catalysts?.length) { const u = state.catalysts.filter(c => c.status !== "passed").slice(0, 5); if (u.length) { lines.push("\nCATALYSTS:"); for (const c of u) lines.push(`  ${c.date} ${c.position}: ${c.event}`); } }
  if (state.pipeline?.length) { const ac = state.pipeline.filter(p => p.status !== "filled"); if (ac.length) { lines.push("\nPIPELINE:"); for (const pp of ac) lines.push(`  Slot${pp.slot} [${pp.status}] ${pp.candidate} — ${pp.day}`); } }
  if (state.pm_profile?.patterns_to_watch?.length) lines.push(`\nPM WATCH: ${state.pm_profile.patterns_to_watch.join(". ")}`);
  return lines.join("\n");
}

// ═══ KNOWLEDGE FLAG PARSER ═══
function extractKnowledgeFlags(text) {
  const lines = text.split("\n"), flags = [], clean = [];
  for (const line of lines) {
    const m = line.match(/^KNOWLEDGE_FLAG:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);
    if (m) flags.push({ category: m[1].trim(), fact: m[2].trim(), source: m[3].trim(), date: new Date().toISOString().slice(0, 10) });
    else clean.push(line);
  }
  return { cleanText: clean.join("\n"), flags };
}

// ═══ MAIN HANDLER ═══
export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.messages?.length) return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    const userMsg = body.messages[body.messages.length - 1]?.content || "";

    // Client state passthrough — UI sends state + prices with every message
    const clientState = body.client_state || null;
    const clientPrices = body.client_prices || null;

    // Load from KV (fallback to client, fallback to default)
    const fundState = clientState || await kvGet("apex:state") || DEFAULT_STATE;

    // Fetch prices — dynamic based on held positions
    const serverPrices = await loadPrices(fundState.positions || []);
    const mergedPrices = { ...serverPrices, ...(clientPrices || {}) };

    // Fast path
    const fast = tryFastPath(userMsg, fundState, mergedPrices);
    if (fast) return NextResponse.json({ content: fast.content, pathway: fast.pathway, urgency: "normal", entities: [], compliance: "CLEAR", knowledge_flags: [] });

    // ═══ REGEX-FIRST ROUTING ═══
    let pathway = "general", entities = [], urgency = "normal", contextNotes = "";
    const l = userMsg.toLowerCase();
    let regexMatched = true;
    if (l.match(/morning|brief|daily|good morning|start.*day/)) pathway = "morning_brief";
    else if (l.match(/should i.*(?:buy|short|open|trade)|new position|trade idea|open a/)) pathway = "trade_proposal";
    else if (l.match(/how is|update on|should i hold|what about|check on/)) pathway = "position_review";
    else if (l.match(/weekly review|sunday review|end of week/)) pathway = "weekly_review";
    else if (l.match(/peace deal|crisis|breaking|emergency|crash|just announced/)) { pathway = "crisis"; urgency = "CRITICAL"; }
    else if (l.match(/analy[sz]e|deep dive|macro view|what comes next|regime|research|thesis/)) pathway = "deep_analysis";
    else if (l.match(/journal|log.*trade|record|trade hist/)) pathway = "journal";
    else if (l.match(/investor update|fund review|full review|capital overview|how are we doing/)) pathway = "investor_update";
    else if (l.match(/deposit|added.*capital|added.*£|added.*gbp/)) pathway = "capital_event";
    else if (l.match(/algo|screen|signal|scan|darvas|monte carlo|risk model/)) pathway = "deep_analysis";
    else regexMatched = false;

    // Extract tickers
    const tickerRe = userMsg.match(/\b(JPM|BAC|FCX|NVDA|MSFT|MS|SMCI|COPX|EWJ|TLT|CVX|MPC|GLNG|APD|DAL|IAG|LNG|FRO|SPX|BRENT|EQT|UAL|BAE|XOM|LMT|RTX|GD|SLB|HAL)\b/gi);
    if (tickerRe) entities = [...new Set(tickerRe.map(t => t.toUpperCase()))];

    // API router fallback for unmatched complex messages
    if (!regexMatched && userMsg.length > 15) {
      try {
        const rr = await callClaude(ROUTER_PROMPT, [{ role: "user", content: userMsg }], false, 200);
        const p = JSON.parse(rr.text.replace(/```json|```/g, "").trim());
        pathway = p.pathway || "general";
        if (Array.isArray(p.entities)) entities = [...entities, ...p.entities];
        urgency = p.urgency || "normal";
        contextNotes = p.context_notes || "";
      } catch (e) { console.error("Router:", e.message); }
    }
    if (urgency === "CRITICAL") pathway = "crisis";
    if (!PATHWAYS[pathway]) pathway = "general";
    await delay(200);

    // ═══ BUILD SYSTEM PROMPT ═══
    const fc = formatContext(fundState, serverPrices, clientPrices);
    let sp = BRAINSTEM + "\n\n" + AMYGDALA_PREAMBLE + "\n\n" + PATHWAYS[pathway];
    if (["weekly_review", "deep_analysis", "investor_update"].includes(pathway)) {
      const cs = getCortexSections(pathway, entities, contextNotes);
      if (cs.length) sp += "\n\n=== DEEP KNOWLEDGE ===\n" + cs.join("\n\n");
    }
    sp += fc;

    // Live timestamp
    const ukNow = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/London" }) + " " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    const conflictDay = Math.floor((Date.now() - new Date("2026-02-28").getTime()) / 86400000);
    sp += `\n\nCURRENT DATE/TIME: ${ukNow} (UK). Conflict Day ${conflictDay}. When searching for news, use today's date.`;

    // Price authority
    sp += `\n\nPRICE AUTHORITY: Prices in LIVE FUND STATE are from Yahoo Finance, fetched THIS call. Use them — do NOT web-search for prices already shown. Only search for NEWS/ANALYSIS.`;

    // Call APEX
    const useSearch = ["morning_brief", "trade_proposal", "position_review", "weekly_review", "crisis", "deep_analysis", "investor_update"].includes(pathway);
    const clean = body.messages.map(m => ({ role: m.role, content: m.content }));
    const apex = await callClaude(sp, clean, useSearch, 4096);
    await delay(200);

    const { cleanText, flags: knowledgeFlags } = extractKnowledgeFlags(apex.text);

    // Amygdala — only for capital decisions
    let flag = null;
    if (["trade_proposal", "crisis", "capital_event"].includes(pathway)) {
      try {
        let as = AMYGDALA_PROMPT;
        if (fundState?.positions) as += "\n\nPOSITIONS:\n" + fundState.positions.map(p => `${p.id} [${p.sleeve}] ${p.units}u stop ${p.stop || "none"}`).join("\n");
        if (fundState?.account) as += `\nNAV: £${fundState.account.nav}. 1% = £${$(fundState.account.nav * 0.01)}`;
        const ar = await callClaude(as, [{ role: "user", content: `Review:\n\n${cleanText.slice(0, 3000)}` }], false, 300);
        if (ar.text.trim().startsWith("VIOLATION")) flag = ar.text.trim();
      } catch (e) { console.error("Amygdala:", e.message); }
    }

    let ft = cleanText;
    if (flag) ft += `\n\n⚠️ **COMPLIANCE FLAG**\n${flag}`;

    // Store knowledge flags
    if (knowledgeFlags.length > 0) {
      try {
        const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.nextUrl?.origin || "";
        if (origin) {
          fetch(`${origin}/api/state`, {
            method: "POST",
            headers: { "x-apex-key": auth, "Content-Type": "application/json" },
            body: JSON.stringify({ action: "store_knowledge", flags: knowledgeFlags }),
          }).catch(() => {});
        }
      } catch {}
    }

    const callCount = 1 + (["trade_proposal", "crisis", "capital_event"].includes(pathway) ? 1 : 0) + (!regexMatched && userMsg.length > 15 ? 1 : 0);

    return NextResponse.json({
      content: ft, pathway, urgency, entities,
      compliance: flag ? "VIOLATION" : "CLEAR",
      knowledge_flags: knowledgeFlags,
      cost: { calls: callCount, est_usd: callCount * 0.02 },
    });
  } catch (err) {
    console.error("Brain error:", err);
    return NextResponse.json({ error: "APEX: " + err.message }, { status: 500 });
  }
}
