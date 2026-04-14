import { NextResponse } from "next/server";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";
import { DEFAULT_STATE } from "../../data/fundState.js";

export const maxDuration = 30;

// ═══ KV HELPERS ═══
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.result === null || d.result === undefined) return null;
    let val = d.result;
    // Multi-pass JSON parsing for double-stringified data
    for (let i = 0; i < 3; i++) {
      if (typeof val === "string") { try { val = JSON.parse(val); } catch { break; } }
      else break;
    }
    return val;
  } catch { return null; }
}

// ═══ YAHOO FINANCE PRICE FETCHER ═══
async function fetchYahooPrice(symbol) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    let price = Number(meta.regularMarketPrice);
    let prevClose = Number(meta.chartPreviousClose || meta.previousClose) || price;
    const isPence = PENCE_SYMBOLS.includes(symbol);
    if (isPence) { price /= 100; prevClose /= 100; }
    if (!isFinite(price)) return null;
    const change = price - prevClose;
    const changePct = prevClose ? ((change / prevClose) * 100) : 0;
    return {
      price: Math.round(price * 10000) / 10000,
      prevClose: Math.round(prevClose * 10000) / 10000,
      change: Math.round(change * 10000) / 10000,
      changePct: Math.round(changePct * 100) / 100,
      currency: isPence ? "GBP" : (meta.currency || "USD"),
      marketState: meta.marketState || "UNKNOWN",
    };
  } catch { return null; }
}

// ═══ BUILD DYNAMIC TICKER LIST ═══
function buildTickerList(positions = []) {
  const tickers = {};

  // Always include macro indicators
  tickers.BRENT = "BZ=F";
  tickers.WTI = "CL=F";
  tickers.SPX = "^GSPC";
  tickers.VIX = "^VIX";
  tickers.GBPUSD = "GBPUSD=X";

  // Add ALL held positions — THIS IS THE KEY V2 FIX
  for (const pos of positions) {
    const id = pos.id?.toUpperCase();
    if (!id) continue;
    const w = WATCHLIST[id];
    if (w) {
      tickers[id] = w.yahoo;
    } else {
      // Unknown ticker — try direct Yahoo lookup
      tickers[id] = id;
    }
  }

  // Add watchlist tickers that are marked as held
  for (const [key, w] of Object.entries(WATCHLIST)) {
    if (w.held) tickers[key] = w.yahoo;
  }

  return tickers;
}

// ═══ MAIN HANDLER ═══
export async function GET(req) {
  const authHeader = req.headers.get("x-apex-key");
  if (authHeader !== process.env.APEX_ACCESS_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Load current positions from KV to know which tickers to fetch
    const state = await kvGet("apex:state") || DEFAULT_STATE;
    const positions = state?.positions || DEFAULT_STATE.positions || [];

    // Build dynamic ticker list based on held positions
    const tickerMap = buildTickerList(positions);

    // Fetch all prices in batches of 5 (avoid rate limits)
    const results = {};
    const entries = Object.entries(tickerMap);
    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      await Promise.all(
        batch.map(([key, sym]) =>
          fetchYahooPrice(sym).then(d => { if (d) results[key] = d; })
        )
      );
    }

    const now = new Date();
    return NextResponse.json({
      prices: results,
      timestamp: now.toISOString(),
      uk_time: now.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }),
      source: "Yahoo Finance",
      ticker_count: Object.keys(results).length,
      held_count: positions.length,
    });
  } catch (err) {
    console.error("Prices error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
