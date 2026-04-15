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

// ═══ TELEGRAM ═══
async function tg(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text.slice(0, 4096), parse_mode: "Markdown", disable_web_page_preview: true }),
    });
  } catch (e) { console.error("TG:", e.message); }
}

// ═══ API CALL ═══
async function callAPI(path, method = "GET", body = null) {
  const opts = { method, headers: { "x-apex-key": KEY, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  return r.json();
}

// ═══ CRON 1: PRICES (every 5 min, market hours) ═══
cron.schedule("*/5 8-21 * * 1-5", async () => {
  try {
    const d = await callAPI("/api/prices");
    console.log(`[PRICES] ${d.ticker_count} tickers at ${d.uk_time}`);
  } catch (e) { console.error("[PRICES]", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON 2: RISK MONITOR (every 5 min, US hours) ═══
cron.schedule("*/5 14-21 * * 1-5", async () => {
  try {
    const state = await callAPI("/api/state");
    const prices = await callAPI("/api/prices");
    if (!state?.state?.positions?.length) return;
    const p = prices?.prices || {};

    for (const pos of state.state.positions) {
      const lp = p[pos.id]?.price;
      if (!lp || !pos.stop) continue;
      const stopDist = Math.abs((lp - pos.stop) / lp * 100);

      if (stopDist < 3) {
        await tg(`🔴 *CRITICAL — ${pos.id}*\nPrice: $${lp} | Stop: $${pos.stop}\nDistance: ${stopDist.toFixed(1)}%`);
      } else if (stopDist < 5) {
        await tg(`🟡 *WARNING — ${pos.id}*\nPrice: $${lp} | Stop: $${pos.stop}\nDistance: ${stopDist.toFixed(1)}%`);
      }

      if (pos.t1) {
        const t1Dist = Math.abs((pos.t1 - lp) / lp * 100);
        if (t1Dist < 3) {
          await tg(`🟢 *T1 NEAR — ${pos.id}*\nPrice: $${lp} | T1: $${pos.t1}\nDistance: ${t1Dist.toFixed(1)}%`);
        }
      }
    }
  } catch (e) { console.error("[RISK]", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON 3: MORNING BRIEF (07:00 weekdays) ═══
cron.schedule("0 7 * * 1-5", async () => {
  try {
    console.log("[BRIEF] Generating...");
    const d = await callAPI("/api/chat", "POST", {
      messages: [{ role: "user", content: "Give me my morning brief" }],
    });
    if (d.content) {
      const brief = d.content.length > 3500 ? d.content.slice(0, 3500) + "\n\n_...truncated_" : d.content;
      await tg(`☀️ *MORNING BRIEF*\n\n${brief}`);
      console.log("[BRIEF] Sent");
    }
  } catch (e) { console.error("[BRIEF]", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON 4: EARNINGS COUNTDOWN (12:00 weekdays) ═══
cron.schedule("0 12 * * 1-5", async () => {
  try {
    const state = await callAPI("/api/state");
    const catalysts = state?.state?.catalysts || [];
    const today = new Date();

    for (const cat of catalysts) {
      if (cat.status === "passed") continue;
      const daysUntil = Math.ceil((new Date(cat.date) - today) / 86400000);
      if ([7, 3, 1, 0].includes(daysUntil)) {
        await tg(`📊 *EARNINGS ${daysUntil === 0 ? "TODAY" : `IN ${daysUntil}d`}*\n${cat.position}: ${cat.event}\nDate: ${cat.date}`);
      }
    }
  } catch (e) { console.error("[EARNINGS]", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON 5: OVERNIGHT REPORT (21:15 weekdays) ═══
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
      const dir = (pp.direction || "buy").toLowerCase();
      const pl = (dir === "short" ? pp.entry_price - lp : lp - pp.entry_price) * pp.units;
      const plG = pp.currency === "GBP" ? pl : pl / gbp;
      totalPL += plG;
      return `${pp.id}: $${lp.toFixed(2)} | ${plG >= 0 ? "+" : ""}£${plG.toFixed(2)}`;
    });

    await tg(`🌙 *OVERNIGHT REPORT*\n\nOpen P&L: ${totalPL >= 0 ? "+" : ""}£${totalPL.toFixed(2)}\nRealised: +£${state.state.account.total_realised_pl}\n\n${lines.join("\n")}`);
  } catch (e) { console.error("[OVERNIGHT]", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON 6: WEEKLY REVIEW (Sunday 20:00) ═══
cron.schedule("0 20 * * 0", async () => {
  await tg("📋 *WEEKLY REVIEW TIME*\nOpen APEX and run your Sunday review.\nType: _weekly review_");
}, { timezone: "Europe/London" });

// ═══ CRON 7: SCANNER (every 30 min, market hours) ═══
cron.schedule("*/30 8-21 * * 1-5", async () => {
  try {
    const d = await callAPI("/api/scanner");
    if (d.actionable > 0) {
      const topLines = (d.top5 || []).slice(0, 3).map(t =>
        `${t.ticker}: ${t.score}/100 ($${t.price} ${t.changePct >= 0 ? "+" : ""}${t.changePct}%)`
      ).join("\n");
      await tg(`🔍 *SCANNER* — ${d.scanned} scanned, ${d.actionable} actionable\n\n${topLines}`);
    }
    console.log(`[SCANNER] ${d.scanned} tickers, ${d.actionable} actionable`);
  } catch (e) { console.error("[SCANNER]", e.message); }
}, { timezone: "Europe/London" });

// ═══ CRON 8: DAILY CLEANUP (03:00) ═══
cron.schedule("0 3 * * *", async () => {
  try {
    console.log("[CLEANUP] Running daily maintenance...");
    // Future: prune old knowledge, compact SQLite, etc.
    console.log("[CLEANUP] Done");
  } catch (e) { console.error("[CLEANUP]", e.message); }
}, { timezone: "Europe/London" });

// ═══ START ═══
app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  }).listen(port, "0.0.0.0", () => {
    console.log(`\n🧠 APEX BRAIN V2 running on port ${port}`);
    console.log(`   Base URL: ${BASE}`);
    console.log(`   Mode: ${dev ? "development" : "production"}`);
    console.log(`   Telegram: ${TG_TOKEN ? "configured" : "NOT configured"}`);
    console.log(`   Crons: 8 scheduled\n`);

    if (TG_TOKEN && TG_CHAT) {
      tg("🧠 *APEX BRAIN V2 STARTED*\n\n8 crons active:\n• Prices: 5min\n• Risk: 5min (US hours)\n• Brief: 07:00\n• Earnings: 12:00\n• Overnight: 21:15\n• Weekly: Sun 20:00\n• Scanner: 30min\n• Cleanup: 03:00");
    }
  });
});
