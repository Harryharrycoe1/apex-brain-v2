const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const cron = require("node-cron");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const BASE = process.env.BASE_URL || `http://localhost:${port}`;
const KEY = process.env.APEX_ACCESS_KEY || "Zaq31313";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

async function tg(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text.slice(0, 4096), parse_mode: "Markdown", disable_web_page_preview: true }),
    });
  } catch (e) { console.error("TG:", e.message); }
}

async function callAPI(path, method = "GET", body = null) {
  const opts = { method, headers: { "x-apex-key": KEY, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try { const r = await fetch(`${BASE}${path}`, opts); return r.json(); } catch (e) { console.error(`API ${path}:`, e.message); return null; }
}

// ═══ V3 CORE CRONS ═══

// 1: PRICES (5min market hours)
cron.schedule("*/5 8-21 * * 1-5", async () => {
  const d = await callAPI("/api/prices");
  if (d) console.log(`[PRICES] ${d.ticker_count} tickers`);
}, { timezone: "Europe/London" });

// 2: RISK MONITOR (5min US hours)
cron.schedule("*/5 14-21 * * 1-5", async () => {
  const state = await callAPI("/api/state");
  const prices = await callAPI("/api/prices");
  if (!state?.state?.positions?.length) return;
  for (const pos of state.state.positions) {
    const lp = prices?.prices?.[pos.id]?.price;
    if (!lp || !pos.stop) continue;
    const sd = Math.abs((lp - pos.stop) / lp * 100);
    if (sd < 3) await tg(`🔴 *CRITICAL — ${pos.id}*\nPrice: $${lp} | Stop: $${pos.stop} | ${sd.toFixed(1)}%`);
    else if (sd < 5) await tg(`🟡 *WARNING — ${pos.id}*\nPrice: $${lp} | Stop: $${pos.stop} | ${sd.toFixed(1)}%`);
    if (pos.t1 && Math.abs((pos.t1 - lp) / lp * 100) < 3) await tg(`🟢 *T1 NEAR — ${pos.id}*\n$${lp} → T1: $${pos.t1}`);
  }
}, { timezone: "Europe/London" });

// 3: MORNING BRIEF (07:00)
// V5.0: regime is stored FLAT at apex:regime; peace_signal now works end-to-end.
cron.schedule("0 7 * * 1-5", async () => {
  console.log("[BRIEF] Generating...");
  const [brief, regimeResp, peaceResp] = await Promise.all([
    callAPI("/api/chat", "POST", { messages: [{ role: "user", content: "Give me my morning brief" }] }),
    callAPI("/api/regime"),
    callAPI("/api/altdata?source=peace_signal"),
  ]);

  let msg = `☀️ *MORNING BRIEF*\n\n`;
  // regime route returns { current, previous, shift }
  const regime = regimeResp?.current;
  if (regime?.primary_regime) {
    msg += `*Regime:* ${regime.primary_regime} (${regime.confidence || "?"}% conf)\n`;
    if (regimeResp?.shift?.shift_detected) msg += `🔥 *REGIME SHIFT:* ${regimeResp.shift.from} → ${regimeResp.shift.to}\n`;
  }
  const peace = peaceResp?.peace_signal;
  if (peace?.score != null) {
    msg += `*Peace Signal:* ${peace.score}/${peace.max_score || 8} — ${peace.action}\n\n`;
  }
  if (brief?.content) msg += brief.content.slice(0, 3000);
  await tg(msg);
  console.log("[BRIEF] Sent");
}, { timezone: "Europe/London" });

// 4: EARNINGS (12:00)
cron.schedule("0 12 * * 1-5", async () => {
  const state = await callAPI("/api/state");
  for (const cat of (state?.state?.catalysts || [])) {
    if (cat.status === "passed") continue;
    const days = Math.ceil((new Date(cat.date) - new Date()) / 86400000);
    if ([7, 3, 1, 0].includes(days)) await tg(`📊 *EARNINGS ${days === 0 ? "TODAY" : `IN ${days}d`}*\n${cat.position}: ${cat.event}`);
  }
}, { timezone: "Europe/London" });

// 5: OVERNIGHT (21:15)
cron.schedule("15 21 * * 1-5", async () => {
  const state = await callAPI("/api/state");
  const prices = await callAPI("/api/prices");
  if (!state?.state) return;
  const gbp = Number(state.state.account?.gbp_usd) || 1.34;
  let totalPL = 0;
  const lines = (state.state.positions || []).map(pp => {
    const lp = prices?.prices?.[pp.id]?.price;
    if (!lp) return `${pp.id}: no price`;
    const dir = (pp.direction || "buy").toLowerCase();
    const pl = (dir === "short" ? pp.entry_price - lp : lp - pp.entry_price) * pp.units;
    const plG = pp.currency === "GBP" ? pl : pl / gbp;
    totalPL += plG;
    return `${pp.id}: $${lp.toFixed(2)} | ${plG >= 0 ? "+" : ""}£${plG.toFixed(2)}`;
  });
  await tg(`🌙 *OVERNIGHT*\n\nP&L: ${totalPL >= 0 ? "+" : ""}£${totalPL.toFixed(2)}\nRealised: +£${state.state.account.total_realised_pl}\n\n${lines.join("\n")}`);
}, { timezone: "Europe/London" });

// 6: WEEKLY (Sunday 20:00)
cron.schedule("0 20 * * 0", async () => { await tg("📋 *WEEKLY REVIEW*\nOpen APEX and type: _weekly review_"); }, { timezone: "Europe/London" });

// 7: SCANNER (30min market hours)
// V5.0 FIX C6: scanner returns `actionable` (alias for actionable_raw).
// Old code read `d.actionable` which was undefined — Telegram scanner alerts
// have NEVER fired in production. This now works.
cron.schedule("*/30 8-21 * * 1-5", async () => {
  const d = await callAPI("/api/scanner");
  const actionable = d?.actionable ?? d?.actionable_raw ?? 0;
  const valid = d?.passing_rr ?? 0;
  if (valid > 0) {
    const top = (d.top5 || []).slice(0, 3).map(t => `${t.ticker}: ${t.score}/100 ${t.grade}`).join("\n");
    let body = `🔍 *SCANNER* — ${d.scanned} scanned, ${valid} valid (${actionable} actionable)\n\n${top}`;
    if (d.ai_vetoes) body += `\n\nClaude vetoed ${d.ai_vetoes} setups`;
    if (d.suspect_data_tickers?.length) body += `\n⚠️ Bad data on ${d.suspect_data_tickers.length} tickers`;
    await tg(body);
  }
  console.log(`[SCANNER] ${d?.scanned || 0} scanned, ${valid} valid, ${actionable} actionable, ${d?.ai_vetoes || 0} vetoed`);
}, { timezone: "Europe/London" });

// 8: CLEANUP (03:00)
cron.schedule("0 3 * * *", () => { console.log("[CLEANUP] Daily maintenance"); }, { timezone: "Europe/London" });

// ═══ V4 NEW CRONS ═══

// 9: REGIME DETECTION (hourly during market hours)
// V5.0: regime route returns { current, previous, shift }
cron.schedule("0 8-21 * * 1-5", async () => {
  const d = await callAPI("/api/regime");
  if (d?.shift?.shift_detected) {
    await tg(`🔥 *REGIME SHIFT DETECTED*\n\nFrom: ${d.shift.from}\nTo: ${d.shift.to}\nConfidence: ${d.current?.confidence || "?"}%\n\n_${d.shift.action_required}_`);
  }
  console.log(`[REGIME] ${d?.current?.primary_code || 'unknown'}`);
}, { timezone: "Europe/London" });

// 10: AGENTIC PM LOOP (every 15 min during market hours)
cron.schedule("*/15 8-21 * * 1-5", async () => {
  const d = await callAPI("/api/agentic", "POST");
  if (d?.judgments_generated > 0) {
    console.log(`[AGENTIC] ${d.alerts_detected} alerts, ${d.judgments_generated} judgments sent to Telegram`);
  }
}, { timezone: "Europe/London" });

// 11: PEACE SIGNAL (twice daily — 09:00 and 17:00)
// V5.0: altDataMonitor is now functional — this actually works.
cron.schedule("0 9,17 * * 1-5", async () => {
  const d = await callAPI("/api/altdata?source=peace_signal");
  const score = d?.peace_signal?.score || 0;
  if (score >= 3) {
    const comp = d.peace_signal.components || {};
    await tg(`🕊️ *PEACE SIGNAL ALERT*\n\nScore: ${score}/${d.peace_signal.max_score || 8}\n${d.peace_signal.action}\n\nTrump tone: ${comp.trump}\nHormuz: ${comp.hormuz}\nInsurance: ${comp.insurance}\nQatar: ${comp.qatar}\nBrent: ${comp.brent}`);
  }
  console.log(`[PEACE] Score: ${score}/${d?.peace_signal?.max_score || 8}`);
}, { timezone: "Europe/London" });

// 12: STRATEGY ENGINE (daily at 06:30)
cron.schedule("30 6 * * 1-5", async () => {
  const d = await callAPI("/api/strategy");
  console.log(`[STRATEGY] ${d?.total_recommendations || 0} recommendations for ${d?.regime_full || d?.regime}`);
}, { timezone: "Europe/London" });

// 13: ADAPTIVE LEARNING — no longer "rebuild_from_closed" (which synthesised fake data).
// V5.0 FIX C3: Real signals are now written to setup_tracker at scan time and fed
// through /api/state close_position. The daily cron now just reports calibration stats.
cron.schedule("0 2 * * *", async () => {
  const d = await callAPI("/api/adaptive");
  const summary = d?.summary;
  if (summary?.sample_size >= 10) {
    console.log(`[LEARN] ${summary.sample_size} samples, Brier ${summary.brier_score}, accuracy ${summary.accuracy}%`);
  } else {
    console.log(`[LEARN] ${summary?.sample_size || 0} samples (need 10+ for signal)`);
  }
}, { timezone: "Europe/London" });

// START
app.prepare().then(() => {
  createServer((req, res) => { handle(req, res, parse(req.url, true)); }).listen(port, "0.0.0.0", () => {
    console.log(`\n🧠 APEX BRAIN V5.0 on port ${port} | ${dev ? "dev" : "production"} | TG: ${TG_TOKEN ? "YES" : "NO"} | 13 crons\n`);
    if (TG_TOKEN && TG_CHAT) {
      tg("🧠 *APEX V5.0 STARTED*\n\n*Critical fixes deployed:*\n• changePct bug (no more phantom moves)\n• Regime detection wired correctly\n• Adaptive learning fed from real trades\n• Peace signal framework FUNCTIONAL\n• Scanner Telegram alerts now fire\n• Health check KV keys corrected\n• Vetoed setups preserved for audit\n\n13 crons active. Type /help for commands.");
    }
    try {
      const { startTelegramPolling } = require("./telegramPoll.js");
      setTimeout(() => startTelegramPolling(), 3000);
    } catch (e) { console.error("Telegram polling not started:", e.message); }
  });
});
