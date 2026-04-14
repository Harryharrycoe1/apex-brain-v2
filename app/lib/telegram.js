// APEX BRAIN V2 — TELEGRAM ALERTS
// Sends messages to PM's Telegram via bot

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegram(text, parseMode = "Markdown") {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("Telegram not configured (missing BOT_TOKEN or CHAT_ID)");
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text.slice(0, 4096), // Telegram limit
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });
    const data = await resp.json();
    if (!data.ok) {
      console.error("Telegram send failed:", data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Telegram error:", err.message);
    return false;
  }
}

// Formatted alert types
export async function sendRiskAlert(position, alertType, details) {
  const emoji = alertType === "RED" ? "🔴" : alertType === "AMBER" ? "🟡" : "🟢";
  const msg = `${emoji} *RISK ALERT — ${position}*\n${alertType}: ${details}`;
  return sendTelegram(msg);
}

export async function sendScannerAlert(ticker, score, thesis) {
  const msg = `🔍 *SCANNER — ${ticker}*\nScore: ${score}/100\n${thesis}`;
  return sendTelegram(msg);
}

export async function sendMorningBrief(briefText) {
  const msg = `☀️ *MORNING BRIEF*\n${briefText.slice(0, 3900)}`;
  return sendTelegram(msg);
}

export async function sendEarningsAlert(ticker, daysUntil, consensus) {
  const msg = `📊 *EARNINGS ALERT — ${ticker}*\n${daysUntil} day(s) until earnings\nConsensus EPS: $${consensus || "N/A"}`;
  return sendTelegram(msg);
}
