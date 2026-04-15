import { NextResponse } from "next/server";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { scanUniverse } from "../../lib/scannerAdvanced.js";

export const maxDuration = 60;

// ═══ KV + YAHOO HELPERS ═══
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}

async function fetchYahooPrice(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) return null;
    let price = Number(meta.regularMarketPrice);
    let prev = Number(meta.chartPreviousClose || meta.previousClose) || price;
    const isPence = PENCE_SYMBOLS.includes(symbol);
    if (isPence) { price /= 100; prev /= 100; }
    if (!isFinite(price)) return null;
    const changePct = prev ? ((price - prev) / prev * 100) : 0;

    // Extract 5d close prices for momentum
    const closes = result?.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];

    return {
      price, prevClose: prev, changePct: parseFloat(changePct.toFixed(2)),
      currency: isPence ? "GBP" : meta.currency,
      closes5d: isPence ? closes.map(c => c / 100) : closes,
      volume: result?.indicators?.quote?.[0]?.volume?.slice(-1)?.[0] || 0,
    };
  } catch { return null; }
}

// ═══ SCANNER TICKERS (exclude held, focus on opportunities) ═══
const SCAN_TICKERS = [
  "MPC", "CVX", "XOM", "LMT", "RTX", "GD", "SLB", "HAL",
  "DAL", "UAL", "GLNG", "LNG", "APD", "EQT", "AVGO",
  "GDX", "XLU", "VNQ",
];

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const state = await kvGet("apex:state") || DEFAULT_STATE;
    const positions = state.positions || [];
    const heldTickers = new Set(positions.map(p => p.id));
    const regime = "Rising Growth + Rising Inflation"; // TODO: dynamic regime detection

    // Fetch prices for scan universe
    const priceData = {};
    const tickersToScan = SCAN_TICKERS.filter(t => !heldTickers.has(t));

    for (let i = 0; i < tickersToScan.length; i += 5) {
      const batch = tickersToScan.slice(i, i + 5);
      await Promise.all(batch.map(t => {
        const sym = WATCHLIST[t]?.yahoo || t;
        return fetchYahooPrice(sym).then(d => { if (d) priceData[t] = d; });
      }));
    }

    // Run scanner
    const results = scanUniverse(Object.keys(priceData), priceData, regime, positions);
    const actionable = results.filter(r => r.actionable);
    const top5 = results.slice(0, 5);

    return NextResponse.json({
      scanned: Object.keys(priceData).length,
      actionable: actionable.length,
      top5,
      all: results,
      regime,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Scanner error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  // POST = same as GET but can accept custom params
  return GET(req);
}
