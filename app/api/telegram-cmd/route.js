// APEX BRAIN V4.3 — BIDIRECTIONAL TELEGRAM
// Webhook endpoint for inbound Telegram commands
// Supports: /positions, /close, /brief, /scan, /edit, /regime, /strategy, /help

import { NextResponse } from "next/server";

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    return true;
  } catch { return false; }
}

function $(v, d = 2) { const n = Number(v); return isFinite(n) ? n.toFixed(d) : "—"; }

// ═══ COMMAND HANDLERS ═══

async function handlePositions() {
  const state = await kvGet("apex:state") || {};
  const positions = state.positions || [];
  if (!positions.length) return "📭 No open positions";

  const lines = ["*📊 OPEN POSITIONS*"];
  for (const p of positions) {
    const dir = (p.direction || "buy").toUpperCase();
    lines.push(`\n*${p.id}* — ${dir} | Entry: $${$(p.entry_price)} | Stop: $${$(p.stop)} | T1: $${$(p.t1)}`);
    if (p.thesis) lines.push(`_${p.thesis.slice(0, 100)}_`);
  }
  lines.push(`\n💰 NAV: £${$(state.account?.nav)} | Cash: £${$(state.account?.cash)}`);
  return lines.join("\n");
}

async function handleBrief(req) {
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const r = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "x-apex-key": process.env.APEX_ACCESS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Give me a tactical morning brief — keep it under 300 words" }] }),
    });
    const d = await r.json();
    return d.content || "Brief generation failed";
  } catch (e) {
    return `Brief error: ${e.message}`;
  }
}

async function handleScan(req) {
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const r = await fetch(`${baseUrl}/api/scanner`, {
      headers: { "x-apex-key": process.env.APEX_ACCESS_KEY },
    });
    const d = await r.json();
    if (!d.top5?.length) return "🔍 No actionable opportunities right now";

    const lines = [`*🔍 TOP OPPORTUNITIES* (${d.actionable} actionable)`];
    for (const t of d.top5) {
      lines.push(`\n*${t.ticker}* — ${t.grade} grade | Score: ${t.score}/100`);
    }
    lines.push(`\nRegime: ${d.regime}`);
    return lines.join("\n");
  } catch (e) {
    return `Scan error: ${e.message}`;
  }
}

async function handleRegime(req) {
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const r = await fetch(`${baseUrl}/api/regime`, {
      headers: { "x-apex-key": process.env.APEX_ACCESS_KEY },
    });
    const d = await r.json();
    if (!d.current) return "⚠️ Regime detection unavailable";

    const lines = [`*🌐 MACRO REGIME*`];
    lines.push(`\n*${d.current.primary_regime}*`);
    lines.push(`Confidence: ${d.current.confidence}%`);
    if (d.current.is_transitioning) lines.push(`⚠️ TRANSITIONING — secondary: ${d.current.secondary_regime}`);
    if (d.shift?.shift_detected) lines.push(`\n🔥 *SHIFT DETECTED*\nFrom: ${d.shift.from}\nTo: ${d.shift.to}\n${d.shift.action_required}`);
    lines.push(`\nVIX: ${$(d.current.macro_snapshot?.vix, 1)} | Brent: $${$(d.current.macro_snapshot?.brent, 1)} | DXY: ${$(d.current.macro_snapshot?.dxy, 1)}`);
    return lines.join("\n");
  } catch (e) {
    return `Regime error: ${e.message}`;
  }
}

async function handleClose(ticker, req) {
  // Send the close command to chat route which has the parsing logic
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const r = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "x-apex-key": process.env.APEX_ACCESS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: `Close ${ticker} at market` }] }),
    });
    const d = await r.json();
    return d.content || `Closed ${ticker}`;
  } catch (e) {
    return `Close error: ${e.message}`;
  }
}

async function handleEdit(parts, req) {
  // /edit JPM stop 295  →  natural language to chat route
  const command = `Update ${parts[0]} ${parts[1]} to ${parts[2]}`;
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const r = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "x-apex-key": process.env.APEX_ACCESS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: command }] }),
    });
    const d = await r.json();
    return d.content || `Updated ${parts[0]}`;
  } catch (e) {
    return `Edit error: ${e.message}`;
  }
}

function handleHelp() {
  return `*🧠 APEX COMMAND CENTRE*

*/positions* — Show open book
*/brief* — Tactical brief
*/scan* — Top opportunities
*/regime* — Macro regime + shift detection
*/strategy* — Multi-strategy recommendations
*/close TICKER* — Close position
*/edit TICKER FIELD VALUE* — Edit position (e.g. /edit JPM stop 295)
*/help* — This menu`;
}

async function handleStrategy(req) {
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const r = await fetch(`${baseUrl}/api/strategy`, {
      headers: { "x-apex-key": process.env.APEX_ACCESS_KEY },
    });
    const d = await r.json();
    if (!d.recommendations?.length) return "📋 No strategy recommendations";

    const lines = [`*📋 STRATEGY RECOMMENDATIONS*`];
    lines.push(`Regime: ${d.regime_full || d.regime}\n`);
    for (const rec of d.recommendations.slice(0, 5)) {
      const label = rec.ticker || rec.long_leg?.ticker || rec.long || rec.action || rec.strategy;
      lines.push(`• *${rec.strategy}* — ${label}`);
    }
    return lines.join("\n");
  } catch (e) {
    return `Strategy error: ${e.message}`;
  }
}

// ═══ WEBHOOK HANDLER ═══
export async function POST(req) {
  // Telegram webhook posts here — no auth header from Telegram, so verify via secret in URL or chat ID
  try {
    const body = await req.json();
    const message = body?.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    // Verify chat ID matches our configured one
    const incomingChatId = String(message.chat?.id);
    const configuredChatId = String(process.env.TELEGRAM_CHAT_ID);
    if (incomingChatId !== configuredChatId) {
      return NextResponse.json({ ok: false, error: "Unauthorized chat" });
    }

    const text = message.text.trim();
    if (!text.startsWith("/")) return NextResponse.json({ ok: true });

    const parts = text.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    let response = "";

    switch (command) {
      case "positions": response = await handlePositions(); break;
      case "brief": response = await handleBrief(req); break;
      case "scan": response = await handleScan(req); break;
      case "regime": response = await handleRegime(req); break;
      case "strategy": response = await handleStrategy(req); break;
      case "close":
        if (!parts[1]) response = "Usage: /close TICKER";
        else response = await handleClose(parts[1].toUpperCase(), req);
        break;
      case "edit":
        if (parts.length < 4) response = "Usage: /edit TICKER FIELD VALUE\nExample: /edit JPM stop 295";
        else response = await handleEdit(parts.slice(1), req);
        break;
      case "help":
      case "start":
        response = handleHelp(); break;
      default:
        response = `Unknown command: /${command}\n\nType /help for available commands`;
    }

    await sendTelegram(response);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    await sendTelegram(`⚠️ Command error: ${err.message}`);
    return NextResponse.json({ ok: false, error: err.message });
  }
}

// GET = setup helper (returns webhook URL to register with Telegram)
export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseUrl = process.env.BASE_URL || `http://${req.headers.get("host")}`;
  const webhookUrl = `${baseUrl}/api/telegram-cmd`;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  // Auto-register webhook
  if (token) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const result = await r.json();
      return NextResponse.json({
        webhook_url: webhookUrl,
        telegram_response: result,
        message: result.ok ? "✅ Webhook registered" : "❌ Webhook registration failed",
      });
    } catch (e) {
      return NextResponse.json({ webhook_url: webhookUrl, error: e.message });
    }
  }
  return NextResponse.json({ webhook_url: webhookUrl, error: "No bot token configured" });
}
