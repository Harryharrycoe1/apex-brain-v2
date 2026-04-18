// APEX BRAIN V5.1 — PRICES ROUTE
// V5.0 fixes: C1 (chartPreviousClose bug), S3 (stale extended-hours quote filter)
// V5.1 adds: trailing stop worker — auto-advances trailing stops on every price tick,
// persists to KV, logs advances/breaches to strategy log.

import { NextResponse } from "next/server";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { processTrailingStops, formatTrailingUpdates } from "../../lib/trailingStopWorker.js";

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
// V5.0 FIX C1: derive prevClose from the last 2 bars in the closes array,
// NOT meta.chartPreviousClose (which returns ~1 year ago on range=1y).
// On range=5d specifically, chartPreviousClose is the first close in the range — still not yesterday.
// V5.0 FIX S3: no longer unconditionally prefer postMarket/preMarket over regular price.
// Only use extended-hours price when sane (within 10% of last regular close).
// A stale/thin bid at 3% of last close would corrupt changePct for all consumers.
async function fetchYahoo(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=true`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const isPence = PENCE_SYMBOLS.includes(symbol);
    const adj = isPence ? 100 : 1;
    let price = Number(meta.regularMarketPrice) / adj;
    let preMarket = meta.preMarketPrice ? Number(meta.preMarketPrice) / adj : null;
    let postMarket = meta.postMarketPrice ? Number(meta.postMarketPrice) / adj : null;

    if (!isFinite(price)) return null;

    // V5.0 FIX C1: compute prev from bar history, not meta.
    const closes = (result?.indicators?.quote?.[0]?.close?.filter(c => c != null) || []).map(c => c / adj);
    let prev;
    if (closes.length >= 2) {
      prev = closes[closes.length - 2];
    } else if (closes.length === 1) {
      // Only today's bar — use meta.previousClose (single-day endpoint's true previous)
      prev = Number(meta.previousClose) / adj || price;
    } else {
      prev = Number(meta.previousClose) / adj || price;
    }

    // V5.0 FIX S3: validate extended-hours prices before using them.
    // A stale/erroneous pre/post market quote can be far from the actual price.
    // Only substitute if within 10% of regular price (typical max overnight move).
    const isSane = (p) => p && isFinite(p) && Math.abs((p - price) / price) < 0.10;
    const effectivePrice = (marketState(meta) === "POST" && isSane(postMarket)) ? postMarket
                        : (marketState(meta) === "PRE" && isSane(preMarket)) ? preMarket
                        : price;

    const changePct = prev > 0 ? ((effectivePrice - prev) / prev * 100) : 0;

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
      closes5d: closes,
    };
  } catch (e) {
    return null;
  }
}

// Helper: market state from meta
function marketState(meta) {
  const s = (meta?.marketState || "").toUpperCase();
  if (s.startsWith("PRE")) return "PRE";
  if (s.startsWith("POST")) return "POST";
  return "REGULAR";
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
  let result = await fetchYahoo(yahooSymbol);
  if (result) return result;

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

    if (errors.length > 0) {
      const errorLog = await kvGet("apex:price_errors") || [];
      errorLog.push({ timestamp: now.toISOString(), errors, elapsed_ms: elapsed });
      if (errorLog.length > 100) errorLog.splice(0, errorLog.length - 100);
      await kvSet("apex:price_errors", errorLog);
    }

    // V5.1: Process trailing stops on every price tick.
    // Mutates state.positions in-place. Persist + log if any advanced or breached.
    let trailingUpdates = [];
    try {
      trailingUpdates = processTrailingStops(state, results);
      if (trailingUpdates.length > 0) {
        // Persist the updated state (positions now have new trailing_stop / HWM values)
        state.account = state.account || {};
        state.account.last_updated = now.toISOString();
        await kvSet("apex:state", state);

        // Log to strategy log if any breach or meaningful advance
        const breached = trailingUpdates.filter(u => u.breached);
        const advanced = trailingUpdates.filter(u => u.advanced && !u.breached);
        if (breached.length || advanced.length) {
          const log = await kvGet("apex:state") ? (state.strategy_log || []) : [];
          if (breached.length) {
            for (const b of breached) {
              log.push({
                date: now.toISOString(),
                note: `🚨 TRAILING STOP BREACHED: ${b.ticker} — price crossed trailing stop at $${b.new_stop}. CLOSE MANUALLY ON T212.`,
                category: "risk_alert",
                author: "trailing_worker",
              });
            }
          }
          if (advanced.length) {
            for (const a of advanced) {
              log.push({
                date: now.toISOString(),
                note: `🔒 Trailing stop advanced: ${a.ticker} $${a.old_stop || "init"} → $${a.new_stop} (HWM $${a.hwm}, ${a.trail_pct}%)`,
                category: "trailing_update",
                author: "trailing_worker",
              });
            }
          }
          state.strategy_log = log.slice(-200);
          await kvSet("apex:state", state);
        }
      }
    } catch (e) {
      console.error("Trailing stop worker error:", e.message);
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
      // V5.1: expose trailing stop updates so UI can show breach alerts
      trailing_updates: trailingUpdates.length > 0 ? trailingUpdates : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
