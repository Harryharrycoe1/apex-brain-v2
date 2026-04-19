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
  // V5.1: Fire Telegram breach alerts from trailing_updates surfaced by /api/prices
  if (d?.trailing_updates?.length) {
    for (const u of d.trailing_updates) {
      if (u.breached) {
        await tg(`🚨 *TRAILING STOP BREACHED — ${u.ticker}*\nPrice crossed $${u.new_stop}\n⚠️ CLOSE MANUALLY ON T212 NOW`);
      } else if (u.advanced && u.old_stop) {
        // Silent advance — only log, no Telegram spam every tick
        console.log(`[TRAIL] ${u.ticker} advanced $${u.old_stop} → $${u.new_stop}`);
      }
    }
  }
}, { timezone: "Europe/London" });

// 2: RISK MONITOR (5min US hours)
// V5.1: Skip STOP_WARN/CRITICAL alerts for positions with active trailing stop —
// trailing stops are intentionally close to price to lock profit, so the old
// proximity alerts become noise. Trailing breach alerts fire from cron 1 above.
cron.schedule("*/5 14-21 * * 1-5", async () => {
  const state = await callAPI("/api/state");
  const prices = await callAPI("/api/prices");
  if (!state?.state?.positions?.length) return;
  for (const pos of state.state.positions) {
    const lp = prices?.prices?.[pos.id]?.price;
    if (!lp || !pos.stop) continue;
    // V5.1: Skip traditional stop alerts if trailing stop is active
    const hasTrailing = pos.trailing_stop != null && pos.trailing_stop_pct != null;
    if (!hasTrailing) {
      const sd = Math.abs((lp - pos.stop) / lp * 100);
      if (sd < 3) await tg(`🔴 *CRITICAL — ${pos.id}*\nPrice: $${lp} | Stop: $${pos.stop} | ${sd.toFixed(1)}%`);
      else if (sd < 5) await tg(`🟡 *WARNING — ${pos.id}*\nPrice: $${lp} | Stop: $${pos.stop} | ${sd.toFixed(1)}%`);
    }
    // T1 alert fires regardless of trailing status
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

// V5.2 CRON 14: DAILY REVIEW NUDGE (R10)
// If no morning brief read in 24h, nudge at 09:30.
cron.schedule("30 9 * * 1-5", async () => {
  const log = await callAPI("/api/state");
  const strategyLog = log?.state?.strategy_log || [];
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentMorningBrief = strategyLog.some(e =>
    (e.note || "").toLowerCase().includes("morning") && new Date(e.date).getTime() > oneDayAgo
  );
  if (!recentMorningBrief) {
    await tg("⏰ *DAILY REVIEW REMINDER (R10)*\n\nOperating Bible: every position reviewed daily.\n\nNo morning brief detected in last 24h. Open APEX and type: _morning brief_");
  }
}, { timezone: "Europe/London" });

// V5.2 CRON 15: CORRELATION AUDIT (R7) — runs nightly
// Detects positions sharing sector + direction + kill switch
cron.schedule("0 22 * * 0-6", async () => {
  const log = await callAPI("/api/state");
  const positions = log?.state?.positions || [];
  if (positions.length < 2) return;

  const correlations = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i], b = positions[j];
      const aSector = (a.sector || "").toLowerCase();
      const bSector = (b.sector || "").toLowerCase();
      const aDir = (a.direction || "buy").toLowerCase();
      const bDir = (b.direction || "buy").toLowerCase();
      const aKill = (a.kill_switch || "").toLowerCase();
      const bKill = (b.kill_switch || "").toLowerCase();
      const sectorMatch = aSector && bSector && aSector === bSector;
      const dirMatch = aDir === bDir;
      const killMatch = aKill && bKill && (aKill.includes(bKill) || bKill.includes(aKill));
      if (sectorMatch && dirMatch && killMatch) {
        correlations.push(`${a.id} <-> ${b.id} (sector=${aSector}, kill overlap)`);
      }
    }
  }

  if (correlations.length > 0) {
    await tg(`🔗 *R7 CORRELATION AUDIT*\n\n${correlations.length} correlated pair(s) detected:\n\n${correlations.map(c => "• " + c).join("\n")}\n\nLTCM lesson: correlated positions become ONE position in crisis. Review sleeve exposure.`);
  }
}, { timezone: "Europe/London" });

// V5.2 CRON 16: DRAWDOWN MONITOR — fires once on crossing 15% or 20%, resets on recovery below 10%
cron.schedule("*/30 8-21 * * 1-5", async () => {
  const r = await callAPI("/api/rules");
  if (!r) return;
  const dd = Number(r.drawdown_pct) || 0;
  const stateResp = await callAPI("/api/state");
  const prev = Number(stateResp?.state?.account?.last_alerted_drawdown) || 0;

  if (dd >= 20 && prev < 20) {
    await tg(`🚨 *R4 HALT TRIGGERED*\n\nDrawdown: ${dd.toFixed(2)}%\n\nPer Operating Bible: reduce all positions to 50% and halt new entries. Full portfolio review required.`);
    await callAPI("/api/state", "POST", { action: "sync_account", actor: "system", reason: "R4 halt threshold crossed", last_alerted_drawdown: 20 });
  } else if (dd >= 15 && prev < 15) {
    await tg(`⚠️ *R4 WARNING*\n\nDrawdown: ${dd.toFixed(2)}%\n\nApproaching 20% halt threshold. Consider tightening stops or reducing risk.`);
    await callAPI("/api/state", "POST", { action: "sync_account", actor: "system", reason: "R4 warning threshold crossed", last_alerted_drawdown: 15 });
  } else if (dd < 10 && prev > 0) {
    // Recovery: reset alert state so crossing again fires a new alert
    await callAPI("/api/state", "POST", { action: "sync_account", actor: "system", reason: "Drawdown recovered below 10%", last_alerted_drawdown: 0 });
  }
}, { timezone: "Europe/London" });

// START
app.prepare().then(() => {
  createServer((req, res) => { handle(req, res, parse(req.url, true)); }).listen(port, "0.0.0.0", () => {
    console.log(`\n🧠 APEX BRAIN V5.2 on port ${port} | ${dev ? "dev" : "production"} | TG: ${TG_TOKEN ? "YES" : "NO"} | 16 crons\n`);
    if (TG_TOKEN && TG_CHAT) {
      tg("🧠 *APEX V5.2 STARTED*\n\n*Institutional-grade upgrades:*\n• Operating Bible rule enforcement at entry\n• Fund-level drawdown halt at 20% (R4)\n• Monthly loss tracker (R3)\n• Full audit trail of every state mutation\n• Correlation audit (R7 nightly)\n• Daily review nudge (R10)\n• Trailing stops: market-state aware, split detection\n• Race-condition-safe state writes\n\n16 crons active. Type /help for commands.");
    }
    try {
      const { startTelegramPolling } = require("./telegramPoll.js");
      setTimeout(() => startTelegramPolling(), 3000);
    } catch (e) { console.error("Telegram polling not started:", e.message); }
  });
});
