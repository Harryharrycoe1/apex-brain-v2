import { NextResponse } from "next/server";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";
import { DEFAULT_STATE } from "../../data/fundState.js";

export const maxDuration = 30;

// ═══ KV ═══
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try { const r = await fetch(`${url}/set/${key}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) }); return r.ok; } catch { return false; }
}

// ═══ YAHOO FINANCE (PRIMARY) — includes pre/post market ═══
async function fetchYahoo(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=true`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const isPence = PENCE_SYMBOLS.includes(symbol);
    let price = Number(meta.regularMarketPrice);
    let prev = Number(meta.chartPreviousClose || meta.previousClose) || price;
    let preMarket = meta.preMarketPrice ? Number(meta.preMarketPrice) : null;
    let postMarket = meta.postMarketPrice ? Number(meta.postMarketPrice) : null;

    if (isPence) {
      price /= 100; prev /= 100;
      if (preMarket) preMarket /= 100;
      if (postMarket) postMarket /= 100;
    }
    if (!isFinite(price)) return null;

    // Use the most recent available price
    const effectivePrice = postMarket || preMarket || price;
    const changePct = prev ? ((effectivePrice - prev) / prev * 100) : 0;

    // 5d closes for momentum
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];

    return {
      price: Math.round(effectivePrice * 10000) / 10000,
      regular: Math.round(price * 10000) / 10000,
      preMarket: preMarket ? Math.round(preMarket * 10000) / 10000 : null,
      postMarket: postMarket ? Math.round(postMarket * 10000) / 10000 : null,
      prevClose: Math.round(prev * 10000) / 10000,
      changePct: Math.round(changePct * 100) / 100,
      currency: isPence ? "GBP" : (meta.currency || "USD"),
      marketState: meta.marketState || "UNKNOWN",
      source: "yahoo",
      closes5d: isPence ? closes.map(c => c / 100) : closes,
    };
  } catch (e) {
    return null;
  }
}

// ═══ FINNHUB BACKUP (free tier: 60 calls/min) ═══
async function fetchFinnhub(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.c || d.c === 0) return null;
    return {
      price: d.c,
      prevClose: d.pc || d.c,
      changePct: d.pc ? Math.round(((d.c - d.pc) / d.pc * 100) * 100) / 100 : 0,
      high: d.h, low: d.l, open: d.o,
      source: "finnhub",
      marketState: "UNKNOWN",
    };
  } catch { return null; }
}

// ═══ FETCH WITH FALLBACK ═══
async function fetchPrice(key, yahooSymbol) {
  // Try Yahoo first
  let result = await fetchYahoo(yahooSymbol);
  if (result) return result;

  // Fallback to Finnhub (US stocks only, different symbol format)
  if (!yahooSymbol.includes("=") && !yahooSymbol.startsWith("^") && !yahooSymbol.includes(".")) {
    result = await fetchFinnhub(yahooSymbol);
    if (result) return result;
  }

  return null;
}

// ═══ BUILD TICKER LIST ═══
function buildTickerList(positions = []) {
  const tickers = {};
  tickers.BRENT = "BZ=F"; tickers.WTI = "CL=F"; tickers.SPX = "^GSPC";
  tickers.VIX = "^VIX"; tickers.GBPUSD = "GBPUSD=X";

  for (const pos of positions) {
    const id = pos.id?.toUpperCase();
    if (!id) continue;
    const w = WATCHLIST[id];
    tickers[id] = w ? w.yahoo : id;
  }
  for (const [key, w] of Object.entries(WATCHLIST)) {
    if (w.held) tickers[key] = w.yahoo;
  }
  return tickers;
}

// ═══ MAIN ═══
export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startTime = Date.now();
  try {
    const state = await kvGet("apex:state") || DEFAULT_STATE;
    const positions = state?.positions || DEFAULT_STATE.positions || [];
    const tickerMap = buildTickerList(positions);

    const results = {};
    const errors = [];
    const entries = Object.entries(tickerMap);

    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      await Promise.all(batch.map(([key, sym]) =>
        fetchPrice(key, sym).then(d => {
          if (d) results[key] = d;
          else errors.push({ ticker: key, symbol: sym, error: "No data returned" });
        }).catch(e => errors.push({ ticker: key, symbol: sym, error: e.message }))
      ));
    }

    const now = new Date();
    const elapsed = Date.now() - startTime;

    // Log errors for health monitoring
    if (errors.length > 0) {
      const errorLog = await kvGet("apex:price_errors") || [];
      errorLog.push({ timestamp: now.toISOString(), errors, elapsed_ms: elapsed });
      if (errorLog.length > 100) errorLog.splice(0, errorLog.length - 100);
      await kvSet("apex:price_errors", errorLog);
    }

    return NextResponse.json({
      prices: results,
      timestamp: now.toISOString(),
      uk_time: now.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }),
      source: "yahoo+finnhub",
      ticker_count: Object.keys(results).length,
      held_count: positions.length,
      errors: errors.length > 0 ? errors : undefined,
      elapsed_ms: elapsed,
      market_state: results.SPX?.marketState || "UNKNOWN",
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
