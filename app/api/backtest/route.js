import { NextResponse } from "next/server";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";
import { scoreOpportunity } from "../../lib/scannerAdvanced.js";

export const maxDuration = 180;

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try { const r = await fetch(`${url}/set/${key}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) }); return r.ok; } catch { return false; }
}

// ═══ PULL 1yr DAILY BARS ═══
async function fetchHistorical(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result?.meta) return null;
    const isPence = PENCE_SYMBOLS.includes(symbol);
    const adj = isPence ? 100 : 1;
    const ts = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close?.map(c => c != null ? c / adj : null) || [];
    const highs = result.indicators?.quote?.[0]?.high?.map(c => c != null ? c / adj : null) || [];
    const lows = result.indicators?.quote?.[0]?.low?.map(c => c != null ? c / adj : null) || [];
    const opens = result.indicators?.quote?.[0]?.open?.map(c => c != null ? c / adj : null) || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    // Build bars array aligned with timestamp
    const bars = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] == null || highs[i] == null || lows[i] == null || opens[i] == null) continue;
      bars.push({
        date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        open: opens[i], high: highs[i], low: lows[i], close: closes[i], volume: volumes[i] || 0,
      });
    }
    return bars;
  } catch { return null; }
}

// ═══ COMPUTE SIGNALS FOR A GIVEN BAR INDEX ═══
// Uses bars[0..idx] to compute state as of bar idx
function computeSignalsAtIndex(bars, idx) {
  if (idx < 50) return null; // Need enough history
  const windowBars = bars.slice(0, idx + 1);
  const closes = windowBars.map(b => b.close);
  const highs = windowBars.map(b => b.high);
  const lows = windowBars.map(b => b.low);
  const vols = windowBars.map(b => b.volume);
  const bar = bars[idx];

  // ATR(14)
  let atr = 0;
  if (closes.length >= 15) {
    const trs = [];
    for (let i = closes.length - 14; i < closes.length; i++) {
      trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
    atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  }
  const sma = (arr, p) => arr.length < p ? null : arr.slice(-p).reduce((a, b) => a + b, 0) / p;
  const sma20 = sma(closes, 20), sma50 = sma(closes, 50), sma200 = sma(closes, 200);
  // Weekly: use every 5th bar
  const wCloses = [];
  for (let i = windowBars.length - 1; i >= 0 && wCloses.length < 80; i -= 5) wCloses.unshift(closes[i]);
  const wS20 = wCloses.length >= 20 ? sma(wCloses, 20) : null;
  const wS50 = wCloses.length >= 50 ? sma(wCloses, 50) : null;

  const swingH = Math.max(...highs.slice(-20));
  const swingL = Math.min(...lows.slice(-20));
  const high50 = Math.max(...highs.slice(-50));
  const low50 = Math.min(...lows.slice(-50));
  const recentVol = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const avgVol = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volRatio = avgVol > 0 ? recentVol / avgVol : 1;

  // RSI
  let rsi = null;
  if (closes.length >= 15) {
    const ch = [];
    for (let i = closes.length - 14; i < closes.length; i++) ch.push(closes[i] - closes[i - 1]);
    const g = ch.filter(c => c > 0), l = ch.filter(c => c < 0).map(Math.abs);
    const ag = g.length ? g.reduce((a, b) => a + b, 0) / 14 : 0;
    const al = l.length ? l.reduce((a, b) => a + b, 0) / 14 : 0;
    if (al > 0) rsi = 100 - (100 / (1 + ag / al));
    else if (ag > 0) rsi = 100; else rsi = 50;
  }

  const prev = idx > 0 ? bars[idx - 1].close : bar.close;

  return {
    price: bar.close, prevClose: prev,
    changePct: prev ? ((bar.close - prev) / prev * 100) : 0,
    atr, sma20, sma50, sma200,
    weeklySMA20: wS20, weeklySMA50: wS50,
    swingHigh: swingH, swingLow: swingL,
    high50, low50,
    volRatio, rsi,
    open: bar.open, high: bar.high, low: bar.low, close: bar.close,
  };
}

// ═══ SIMULATE A TRADE ═══
// Given bars[idx] as entry, find the bar where T1 or stop hits
function simulateTrade(bars, entryIdx, direction, entry, stop, t1, maxBars = 40) {
  for (let i = entryIdx + 1; i < Math.min(bars.length, entryIdx + maxBars + 1); i++) {
    const b = bars[i];
    if (direction === "buy") {
      if (b.low <= stop) return { outcome: "STOP", exit_price: stop, bars_held: i - entryIdx, exit_date: b.date };
      if (b.high >= t1) return { outcome: "T1", exit_price: t1, bars_held: i - entryIdx, exit_date: b.date };
    } else {
      if (b.high >= stop) return { outcome: "STOP", exit_price: stop, bars_held: i - entryIdx, exit_date: b.date };
      if (b.low <= t1) return { outcome: "T1", exit_price: t1, bars_held: i - entryIdx, exit_date: b.date };
    }
  }
  // Timed out — exit at current
  const lastIdx = Math.min(bars.length - 1, entryIdx + maxBars);
  return { outcome: "TIMEOUT", exit_price: bars[lastIdx].close, bars_held: lastIdx - entryIdx, exit_date: bars[lastIdx].date };
}

// ═══ BACKTEST A TICKER ═══
// Walk through historical bars, at each bar compute signals, if score >= 65 simulate the trade
function backtestTicker(ticker, bars, regimeCode = "REFLATION") {
  const trades = [];
  // Start from bar 50 (need history) to len - 40 (need exit room)
  for (let i = 50; i < bars.length - 40; i += 5) { // Sample every 5 bars to speed up
    const sig = computeSignalsAtIndex(bars, i);
    if (!sig) continue;
    const result = scoreOpportunity(ticker, sig, regimeCode, []);
    if (!result || !result.actionable || result.confidence < 0.25) continue;

    const atrSize = sig.atr > 0 ? sig.atr : sig.price * 0.02;
    const direction = result.direction;
    let entry = sig.price, stop, t1;
    if (direction === "buy") {
      stop = Math.max(sig.swingLow - atrSize * 0.3, entry - atrSize * 1.5);
      if (entry - stop < atrSize * 0.8) stop = entry - atrSize * 0.8;
      const risk = entry - stop;
      t1 = entry + risk * 3;
    } else {
      stop = Math.min(sig.swingHigh + atrSize * 0.3, entry + atrSize * 1.5);
      if (stop - entry < atrSize * 0.8) stop = entry + atrSize * 0.8;
      const risk = stop - entry;
      t1 = entry - risk * 3;
    }

    const tradeResult = simulateTrade(bars, i, direction, entry, stop, t1);
    const pl = direction === "buy" ? (tradeResult.exit_price - entry) : (entry - tradeResult.exit_price);
    const plR = pl / Math.abs(entry - stop); // R multiples

    trades.push({
      ticker, entry_date: bars[i].date, direction, score: result.score, grade: result.grade,
      confidence: result.confidence, entry, stop, t1,
      outcome: tradeResult.outcome, exit_price: tradeResult.exit_price,
      exit_date: tradeResult.exit_date, bars_held: tradeResult.bars_held,
      pl_dollars: parseFloat(pl.toFixed(2)),
      pl_r: parseFloat(plR.toFixed(2)),
    });
  }
  return trades;
}

// ═══ MAIN ═══
export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const tickersParam = url.searchParams.get("tickers");
    const tickers = tickersParam ? tickersParam.split(",").map(t => t.trim().toUpperCase()) : ["XOM", "NVDA", "JPM", "GLD", "MSFT", "LMT", "DAL", "CVX", "FCX", "TLT"];
    const regime = url.searchParams.get("regime") || "REFLATION";

    const allTrades = [];
    const tickerStats = {};

    for (const ticker of tickers) {
      const sym = WATCHLIST[ticker]?.yahoo || ticker;
      const bars = await fetchHistorical(sym);
      if (!bars || bars.length < 100) { tickerStats[ticker] = { error: "insufficient data" }; continue; }
      const trades = backtestTicker(ticker, bars, regime);
      allTrades.push(...trades);
      const wins = trades.filter(t => t.outcome === "T1");
      const stops = trades.filter(t => t.outcome === "STOP");
      const timeouts = trades.filter(t => t.outcome === "TIMEOUT");
      const totalR = trades.reduce((a, t) => a + t.pl_r, 0);
      tickerStats[ticker] = {
        trades: trades.length, wins: wins.length, stops: stops.length, timeouts: timeouts.length,
        win_rate: trades.length ? (wins.length / trades.length * 100).toFixed(1) + "%" : "0%",
        total_r: parseFloat(totalR.toFixed(2)),
        avg_r: trades.length ? parseFloat((totalR / trades.length).toFixed(2)) : 0,
        expectancy: trades.length ? parseFloat((totalR / trades.length).toFixed(2)) : 0,
      };
    }

    // By grade
    const byGrade = { A: [], B: [], C: [] };
    for (const t of allTrades) {
      if (byGrade[t.grade]) byGrade[t.grade].push(t);
    }
    const gradeStats = {};
    for (const g of ["A", "B", "C"]) {
      const ts = byGrade[g];
      const wins = ts.filter(t => t.outcome === "T1").length;
      const totalR = ts.reduce((a, t) => a + t.pl_r, 0);
      gradeStats[g] = {
        trades: ts.length,
        win_rate: ts.length ? (wins / ts.length * 100).toFixed(1) + "%" : "—",
        total_r: parseFloat(totalR.toFixed(2)),
        expectancy_per_trade_r: ts.length ? parseFloat((totalR / ts.length).toFixed(2)) : 0,
      };
    }

    // Overall
    const totalWins = allTrades.filter(t => t.outcome === "T1").length;
    const totalStops = allTrades.filter(t => t.outcome === "STOP").length;
    const totalR = allTrades.reduce((a, t) => a + t.pl_r, 0);

    const report = {
      timestamp: new Date().toISOString(),
      regime_tested: regime,
      tickers_tested: tickers,
      total_trades: allTrades.length,
      total_wins: totalWins,
      total_stops: totalStops,
      win_rate: allTrades.length ? (totalWins / allTrades.length * 100).toFixed(1) + "%" : "—",
      total_r: parseFloat(totalR.toFixed(2)),
      expectancy_per_trade_r: allTrades.length ? parseFloat((totalR / allTrades.length).toFixed(2)) : 0,
      by_grade: gradeStats,
      by_ticker: tickerStats,
      interpretation: allTrades.length === 0 ? "No trades triggered — scanner too strict in this period/regime." :
        totalR > 0 ? `Positive expectancy: +${(totalR / allTrades.length).toFixed(2)}R per trade. System shows edge.` :
        totalR < 0 ? `Negative expectancy: ${(totalR / allTrades.length).toFixed(2)}R per trade. System needs calibration.` :
        "Break-even. Need more data or parameter tuning.",
    };

    await kvSet("apex:last_backtest", report);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}

export async function POST(req) { return GET(req); }
