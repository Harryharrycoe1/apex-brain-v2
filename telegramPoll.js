// APEX BRAIN V4 — TELEGRAM POLLING
// Works without HTTPS. Long-polls getUpdates and executes commands.

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const KEY = process.env.APEX_ACCESS_KEY;

let lastUpdateId = 0;
let pollingActive = false;

async function tgSend(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: text.slice(0, 4096), parse_mode: "Markdown", disable_web_page_preview: true }),
    });
  } catch (e) { console.error("TG send:", e.message); }
}

async function callAPI(path, method = "GET", body = null) {
  const opts = { method, headers: { "x-apex-key": KEY, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try { const r = await fetch(`${BASE}${path}`, opts); return r.json(); } catch (e) { console.error(`API ${path}:`, e.message); return null; }
}

function fmt(v, d = 2) { const n = Number(v); return isFinite(n) ? n.toFixed(d) : "—"; }

async function handlePositions() {
  const state = (await callAPI("/api/state"))?.state;
  if (!state) return "⚠️ State unavailable";
  const positions = state.positions || [];
  if (!positions.length) return "📭 No open positions";
  const lines = ["*📊 OPEN POSITIONS*"];
  for (const p of positions) {
    const dir = (p.direction || "buy").toUpperCase();
    lines.push(`\n*${p.id}* — ${dir} ${p.units}u | Entry: $${fmt(p.entry_price)} | Stop: $${fmt(p.stop)} | T1: $${fmt(p.t1)}`);
    if (p.thesis) lines.push(`_${p.thesis.slice(0, 80)}_`);
  }
  lines.push(`\n💰 NAV: £${fmt(state.account?.nav)} | Cash: £${fmt(state.account?.cash)}`);
  return lines.join("\n");
}

async function handleBrief() {
  const d = await callAPI("/api/chat", "POST", { messages: [{ role: "user", content: "Give me a tactical morning brief — keep it under 300 words" }] });
  return d?.content || "Brief unavailable";
}

async function handleScan() {
  const d = await callAPI("/api/scanner");
  if (!d?.top5?.length) return "🔍 No opportunities right now";
  const lines = [`*🔍 TOP OPPORTUNITIES* (${d.actionable || 0} actionable)`];
  for (const t of d.top5.slice(0, 5)) {
    lines.push(`\n*${t.ticker}* — ${t.grade} grade | Score: ${t.score}/100`);
  }
  lines.push(`\nRegime: ${d.regime}`);
  return lines.join("\n");
}

async function handleRegime() {
  const d = await callAPI("/api/regime");
  if (!d?.current) return "⚠️ Regime detection unavailable";
  const lines = [`*🌐 MACRO REGIME*`];
  lines.push(`\n*${d.current.primary_regime}*`);
  lines.push(`Confidence: ${d.current.confidence}%`);
  if (d.current.is_transitioning) lines.push(`⚠️ TRANSITIONING — secondary: ${d.current.secondary_regime}`);
  if (d.shift?.shift_detected) lines.push(`\n🔥 *SHIFT DETECTED*\n${d.shift.from} → ${d.shift.to}`);
  if (d.current.macro_snapshot) {
    lines.push(`\nVIX: ${fmt(d.current.macro_snapshot.vix, 1)} | Brent: $${fmt(d.current.macro_snapshot.brent, 1)}`);
  }
  return lines.join("\n");
}

async function handleStrategy() {
  const d = await callAPI("/api/strategy");
  if (!d?.recommendations?.length) return "📋 No strategy recommendations";
  const lines = [`*📋 STRATEGY RECOMMENDATIONS*`];
  lines.push(`Regime: ${d.regime_full || d.regime}\n`);
  for (const rec of d.recommendations.slice(0, 5)) {
    const label = rec.ticker || rec.long_leg?.ticker || rec.long || rec.action || rec.strategy;
    lines.push(`• *${rec.strategy}* — ${label}`);
  }
  return lines.join("\n");
}

async function handlePeaceSignal() {
  const d = await callAPI("/api/altdata?source=peace_signal");
  if (!d?.peace_signal) return "⚠️ Peace signal unavailable";
  const ps = d.peace_signal;
  const lines = [`*🕊️ PEACE SIGNAL*`];
  lines.push(`Score: *${ps.score}/8*`);
  lines.push(`${ps.action}\n`);
  if (ps.components) {
    lines.push(`Trump: ${ps.components.trump}`);
    lines.push(`Hormuz: ${ps.components.hormuz}`);
    lines.push(`Insurance: ${ps.components.insurance}`);
  }
  return lines.join("\n");
}

async function handleClose(ticker) {
  const d = await callAPI("/api/chat", "POST", { messages: [{ role: "user", content: `Close ${ticker} at market` }] });
  return d?.content || `Closed ${ticker}`;
}

async function handleEdit(parts) {
  const [ticker, field, ...rest] = parts;
  const value = rest.join(" ");
  const d = await callAPI("/api/chat", "POST", { messages: [{ role: "user", content: `Update ${ticker} ${field} to ${value}` }] });
  return d?.content || `Updated ${ticker}`;
}

async function handleAsk(rest) {
  const question = rest.join(" ");
  if (!question) return "Usage: /ask <question>\nExample: /ask how is JPM doing?";
  const d = await callAPI("/api/chat", "POST", { messages: [{ role: "user", content: question }] });
  return d?.content?.slice(0, 3500) || "No response";
}

function handleHelp() {
  return `*🧠 APEX COMMAND CENTRE*

*/positions* — Show open book
*/brief* — Tactical morning brief
*/scan* — Top opportunities
*/regime* — Macro regime
*/peace* — Peace signal score
*/strategy* — Strategy recommendations
*/close TICKER* — Close position
*/edit TICKER FIELD VALUE* — Edit position
*/ask QUESTION* — Ask APEX anything
*/help* — This menu`;
}

async function handleCommand(text) {
  const parts = text.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  try {
    switch (command) {
      case "positions": case "pos": case "book": return await handlePositions();
      case "brief": case "morning": return await handleBrief();
      case "scan": case "scanner": case "opportunities": return await handleScan();
      case "regime": case "macro": return await handleRegime();
      case "strategy": case "strat": return await handleStrategy();
      case "peace": case "peacesignal": return await handlePeaceSignal();
      case "close":
        if (!parts[1]) return "Usage: /close TICKER\nExample: /close JPM";
        return await handleClose(parts[1].toUpperCase());
      case "edit":
        if (parts.length < 4) return "Usage: /edit TICKER FIELD VALUE\nExample: /edit JPM stop 295";
        return await handleEdit(parts.slice(1));
      case "ask": return await handleAsk(parts.slice(1));
      case "help": case "start": return handleHelp();
      default: return `Unknown command: /${command}\n\nType /help for commands`;
    }
  } catch (e) {
    return `⚠️ Error: ${e.message}`;
  }
}

async function pollOnce() {
  if (!TG_TOKEN) return;
  try {
    const url = `https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=25&allowed_updates=["message"]`;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const d = await r.json();
    if (!d.ok) { console.error("Polling error:", d.description); return; }

    for (const update of (d.result || [])) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg?.text) continue;
      if (String(msg.chat?.id) !== String(TG_CHAT)) continue;

      const text = msg.text.trim();
      if (!text.startsWith("/")) continue;

      console.log(`[TG] Command: ${text}`);
      const response = await handleCommand(text);
      await tgSend(response);
    }
  } catch (e) {
    if (e.name !== "AbortError" && e.name !== "TimeoutError") {
      console.error("Polling loop error:", e.message);
    }
  }
}

function startTelegramPolling() {
  if (pollingActive) return;
  if (!TG_TOKEN || !TG_CHAT) { console.log("Telegram not configured — polling disabled"); return; }
  pollingActive = true;
  console.log("🔄 Telegram polling started");

  // Get baseline update_id so we don't replay old messages
  fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=-1`)
    .then(r => r.json())
    .then(d => {
      if (d.ok && d.result?.length) {
        lastUpdateId = d.result[d.result.length - 1].update_id;
      }
    })
    .catch(() => {})
    .finally(() => {
      const loop = async () => {
        while (pollingActive) {
          await pollOnce();
          await new Promise(r => setTimeout(r, 1000));
        }
      };
      loop();
    });
}

module.exports = { startTelegramPolling };
