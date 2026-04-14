// APEX BRAIN V2 — CUSTOM SERVER (DigitalOcean)
// Wraps Next.js + runs background cron jobs
// Start: node server.js (or PM2: pm2 start server.js --name apex)

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

// ═══ TELEGRAM HELPER ═══
async function tg(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text.slice(0, 4096), parse_mode: "Markdown", disable_web_page_preview: true }),
    });
  } catch (e) { console.error("TG error:", e.message); }
}

// ═══ INTERNAL API CALL ═══
async function callAPI(path, method = "GET", body = null) {
  const opts = { method, headers: { "x-apex-key": KEY, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  return r.json();
}

// ═══ CRON: PRICE REFRESH (every 5 min during market hours) ═══
cron.schedule("*/5 8-21 * * 1-5", async () => {
  try {
    const d = await callAPI("/api/prices");
    console.log(`[PRICES] ${d.ticker_count} tickers refreshed at ${d.uk_time}`);
  } catch (e) { console.error("[PRICES] Error:", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON: RISK MONITOR (every 5 min during market hours) ═══
cron.schedule("*/5 14-21 * * 1-5", async () => {
  try {
    const state = await callAPI("/api/state");
    const prices = await callAPI("/api/prices");
    if (!state?.state?.positions?.length) return;

    const p = prices?.prices || {};
    const gbp = Number(state.state.account?.gbp_usd) || 1.34;

    for (const pos of state.state.positions) {
      const lp = p[pos.id]?.price;
      if (!lp || !pos.stop) continue;

      const stopDist = Math.abs((lp - pos.stop) / lp * 100);

      if (stopDist < 3) {
        await tg(`🔴 *CRITICAL — ${pos.id}*\nPrice: $${lp} | Stop: $${pos.stop}\nDistance: ${stopDist.toFixed(1)}% — STOP IMMINENT`);
      } else if (stopDist < 5) {
        await tg(`🟡 *WARNING — ${pos.id}*\nPrice: $${lp} | Stop: $${pos.stop}\nDistance: ${stopDist.toFixed(1)}%`);
      }

      // T1 proximity
      if (pos.t1) {
        const t1Dist = Math.abs((pos.t1 - lp) / lp * 100);
        if (t1Dist < 3) {
          await tg(`🟢 *T1 APPROACHING — ${pos.id}*\nPrice: $${lp} | T1: $${pos.t1}\nDistance: ${t1Dist.toFixed(1)}% — Consider partial exit`);
        }
      }
    }
  } catch (e) { console.error("[RISK] Error:", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON: MORNING BRIEF (07:00 GMT weekdays) ═══
cron.schedule("0 7 * * 1-5", async () => {
  try {
    console.log("[BRIEF] Generating morning brief...");
    const d = await callAPI("/api/chat", "POST", {
      messages: [{ role: "user", content: "Give me my morning brief" }],
    });
    if (d.content) {
      // Truncate for Telegram
      const brief = d.content.length > 3500 ? d.content.slice(0, 3500) + "\n\n_...truncated_" : d.content;
      await tg(`☀️ *MORNING BRIEF*\n\n${brief}`);
      console.log("[BRIEF] Sent to Telegram");
    }
  } catch (e) { console.error("[BRIEF] Error:", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON: EARNINGS COUNTDOWN (12:00 GMT weekdays) ═══
cron.schedule("0 12 * * 1-5", async () => {
  try {
    const state = await callAPI("/api/state");
    const catalysts = state?.state?.catalysts || [];
    const today = new Date();

    for (const cat of catalysts) {
      if (cat.status === "passed") continue;
      const catDate = new Date(cat.date);
      const daysUntil = Math.ceil((catDate - today) / 86400000);

      if (daysUntil === 7 || daysUntil === 3 || daysUntil === 1 || daysUntil === 0) {
        await tg(`📊 *EARNINGS ${daysUntil === 0 ? "TODAY" : `IN ${daysUntil} DAY${daysUntil > 1 ? "S" : ""}`}*\n${cat.position}: ${cat.event}\nDate: ${cat.date}`);
      }
    }
  } catch (e) { console.error("[EARNINGS] Error:", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON: OVERNIGHT REPORT (21:15 GMT weekdays) ═══
cron.schedule("15 21 * * 1-5", async () => {
  try {
    const state = await callAPI("/api/state");
    const prices = await callAPI("/api/prices");
    if (!state?.state) return;

    const pos = state.state.positions || [];
    const p = prices?.prices || {};
    const gbp = Number(state.state.account?.gbp_usd) || 1.34;

    let totalPL = 0;
    const lines = pos.map(pp => {
      const lp = p[pp.id]?.price;
      if (!lp) return `${pp.id}: no price`;
      const pl = ((pp.direction || "buy") === "short" ? pp.entry_price - lp : lp - pp.entry_price) * pp.units;
      const plG = pp.currency === "GBP" ? pl : pl / gbp;
      totalPL += plG;
      return `${pp.id}: $${lp.toFixed(2)} | ${plG >= 0 ? "+" : ""}£${plG.toFixed(2)}`;
    });

    await tg(`🌙 *OVERNIGHT REPORT*\n\nOpen P&L: ${totalPL >= 0 ? "+" : ""}£${totalPL.toFixed(2)}\nRealised: +£${state.state.account.total_realised_pl}\n\n${lines.join("\n")}`);
  } catch (e) { console.error("[OVERNIGHT] Error:", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON: WEEKLY REVIEW REMINDER (Sunday 20:00) ═══
cron.schedule("0 20 * * 0", async () => {
  await tg("📋 *WEEKLY REVIEW TIME*\nOpen APEX and run your Sunday review.\n\nType: _weekly review_");
}, { timezone: "Europe/London" });

// ═══ START SERVER ═══
app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, "0.0.0.0", () => {
    console.log(`\n🧠 APEX BRAIN V2 running on port ${port}`);
    console.log(`   Base URL: ${BASE}`);
    console.log(`   Mode: ${dev ? "development" : "production"}`);
    console.log(`   Telegram: ${TG_TOKEN ? "configured" : "NOT configured"}`);
    console.log(`   Crons: 6 scheduled\n`);

    // Startup notification
    if (TG_TOKEN && TG_CHAT) {
      tg("🧠 *APEX BRAIN V2 STARTED*\n\n6 crons active:\n• Prices: every 5min (market hours)\n• Risk monitor: every 5min (US hours)\n• Morning brief: 07:00 GMT\n• Earnings countdown: 12:00 GMT\n• Overnight report: 21:15 GMT\n• Weekly review: Sunday 20:00");
    }
  });
});
