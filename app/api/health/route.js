import { NextResponse } from "next/server";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { BRAINSTEM } from "../../data/brainstem.js";
import { PATHWAYS } from "../../data/pathways.js";
import { WATCHLIST } from "../../data/algoConfig.js";

export const maxDuration = 30;

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); return d.result; } catch { return null; }
}

async function checkYahoo() {
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d", { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const d = await r.json();
    return { ok: !!d?.chart?.result?.[0]?.meta?.regularMarketPrice, price: d?.chart?.result?.[0]?.meta?.regularMarketPrice };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function checkAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No API key" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 5, messages: [{ role: "user", content: "ping" }] }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checks = [];
  const pass = (name, detail) => checks.push({ name, status: "GREEN", detail });
  const warn = (name, detail) => checks.push({ name, status: "AMBER", detail });
  const fail = (name, detail) => checks.push({ name, status: "RED", detail });

  // ENV VARS
  ["ANTHROPIC_API_KEY", "APEX_ACCESS_KEY", "KV_REST_API_URL", "KV_REST_API_TOKEN"].forEach(k => {
    process.env[k] ? pass(`ENV:${k}`, "Set") : fail(`ENV:${k}`, "Missing");
  });
  ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"].forEach(k => {
    process.env[k] ? pass(`ENV:${k}`, "Set") : warn(`ENV:${k}`, "Not configured");
  });

  // DATA FILES
  pass("DATA:brainstem", `${BRAINSTEM.length} chars`);
  pass("DATA:pathways", `${Object.keys(PATHWAYS).length} pathways`);
  pass("DATA:fundState", `${DEFAULT_STATE.positions.length} positions, ${DEFAULT_STATE.closed.length} closed`);
  pass("DATA:watchlist", `${Object.keys(WATCHLIST).length} tickers`);

  // KV
  const kvState = await kvGet("apex:state");
  kvState ? pass("KV:state", `Loaded, ${(kvState.positions || []).length} positions`) : warn("KV:state", "Empty — using defaults");

  // YAHOO
  const yahoo = await checkYahoo();
  yahoo.ok ? pass("YAHOO:prices", `AAPL=$${yahoo.price}`) : fail("YAHOO:prices", yahoo.error);

  // ANTHROPIC
  const anth = await checkAnthropic();
  anth.ok ? pass("ANTHROPIC:api", `Status ${anth.status}`) : fail("ANTHROPIC:api", anth.error || `Status ${anth.status}`);

  // TELEGRAM
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
      const d = await r.json();
      d.ok ? pass("TELEGRAM:bot", `@${d.result.username}`) : fail("TELEGRAM:bot", d.description);
    } catch (e) { fail("TELEGRAM:bot", e.message); }
  }

  const green = checks.filter(c => c.status === "GREEN").length;
  const amber = checks.filter(c => c.status === "AMBER").length;
  const red = checks.filter(c => c.status === "RED").length;

  const readable = [
    `APEX BRAIN V2 HEALTH CHECK`,
    `${green}/${checks.length} GREEN | ${amber} AMBER | ${red} RED`,
    `Overall: ${red > 0 ? "DEGRADED" : amber > 0 ? "HEALTHY (warnings)" : "ALL SYSTEMS GREEN"}`,
    "",
    ...checks.map(c => `${c.status === "GREEN" ? "✅" : c.status === "AMBER" ? "🟡" : "🔴"} ${c.name}: ${c.detail}`),
  ].join("\n");

  return NextResponse.json({ checks, green, amber, red, total: checks.length, readable });
}
