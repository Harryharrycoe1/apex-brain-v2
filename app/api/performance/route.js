import { NextResponse } from "next/server";

export const maxDuration = 30;

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}

// ═══ COMPUTE DAILY NAV SERIES ═══
function computeDailyNAV(state) {
  const startDate = new Date(state.account?.inception_date || "2026-03-17");
  const today = new Date();
  const deposits = state.deposits || [];
  const closed = state.closed || [];

  const days = Math.ceil((today - startDate) / 86400000);
  const series = [];

  let runningDeposits = 0;
  let runningRealised = 0;

  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    const dStr = d.toISOString().slice(0, 10);

    // Add deposits that occurred on this day
    for (const dep of deposits) {
      if (dep.date === dStr) runningDeposits += dep.amount;
    }

    // Add realised P&L from trades closed on this day
    for (const t of closed) {
      if (t.exit_date?.slice(0, 10) === dStr) runningRealised += (t.net_pl || 0);
    }

    series.push({
      date: dStr,
      nav: Math.round((runningDeposits + runningRealised) * 100) / 100,
      deposited: runningDeposits,
      realised: Math.round(runningRealised * 100) / 100,
    });
  }

  return series;
}

// ═══ DRAWDOWN CURVE ═══
function computeDrawdown(navSeries) {
  let peak = 0;
  return navSeries.map(d => {
    peak = Math.max(peak, d.nav);
    const dd = peak > 0 ? ((d.nav - peak) / peak) * 100 : 0;
    return { date: d.date, nav: d.nav, peak, drawdown_pct: Math.round(dd * 100) / 100 };
  });
}

// ═══ MONTHLY RETURNS ═══
function computeMonthlyReturns(navSeries, deposits) {
  const monthly = {};
  for (const d of navSeries) {
    const month = d.date.slice(0, 7);
    if (!monthly[month]) monthly[month] = { start_nav: d.nav, end_nav: d.nav, deposits: 0 };
    monthly[month].end_nav = d.nav;
  }
  for (const dep of (deposits || [])) {
    const month = dep.date.slice(0, 7);
    if (monthly[month]) monthly[month].deposits += dep.amount;
  }
  const result = [];
  let lastEndNav = 0;
  for (const [month, m] of Object.entries(monthly)) {
    const startNav = lastEndNav || m.start_nav;
    const gain = m.end_nav - startNav - m.deposits;
    const returnPct = startNav > 0 ? (gain / startNav) * 100 : 0;
    result.push({
      month,
      start_nav: startNav,
      end_nav: m.end_nav,
      deposits: m.deposits,
      gain: Math.round(gain * 100) / 100,
      return_pct: Math.round(returnPct * 100) / 100,
    });
    lastEndNav = m.end_nav;
  }
  return result;
}

// ═══ SHARPE RATIO (using daily returns) ═══
function computeSharpe(navSeries, riskFreeRate = 0.045) {
  const returns = [];
  for (let i = 1; i < navSeries.length; i++) {
    const prev = navSeries[i - 1].nav;
    const curr = navSeries[i].nav;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  if (returns.length < 5) return { sharpe: null, sortino: null, insufficient_data: true };

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);

  // Annualized Sharpe
  const dailyRf = riskFreeRate / 252;
  const sharpe = std > 0 ? ((mean - dailyRf) / std) * Math.sqrt(252) : 0;

  // Sortino (downside deviation only)
  const downside = returns.filter(r => r < 0);
  const downsideStd = downside.length ? Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / downside.length) : 0;
  const sortino = downsideStd > 0 ? ((mean - dailyRf) / downsideStd) * Math.sqrt(252) : 0;

  return {
    sharpe: parseFloat(sharpe.toFixed(2)),
    sortino: parseFloat(sortino.toFixed(2)),
    volatility_annual: parseFloat((std * Math.sqrt(252) * 100).toFixed(2)),
    mean_daily_return: parseFloat((mean * 100).toFixed(4)),
    sample_days: returns.length,
  };
}

// ═══ WIN RATE + PROFIT FACTOR ═══
function computeTradeStats(closed) {
  if (!closed?.length) return null;
  const wins = closed.filter(t => t.net_pl > 0);
  const losses = closed.filter(t => t.net_pl <= 0);
  const totalWins = wins.reduce((a, t) => a + t.net_pl, 0);
  const totalLosses = Math.abs(losses.reduce((a, t) => a + t.net_pl, 0));

  const avgWin = wins.length ? totalWins / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, t) => a + t.net_pl, 0) / losses.length) : 0;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 99 : 0);
  const expectancy = (wins.length / closed.length) * avgWin - (losses.length / closed.length) * avgLoss;

  // By sleeve
  const bySleeve = {};
  for (const t of closed) {
    const s = t.sleeve || "unknown";
    if (!bySleeve[s]) bySleeve[s] = { trades: 0, wins: 0, total_pl: 0 };
    bySleeve[s].trades++;
    if (t.net_pl > 0) bySleeve[s].wins++;
    bySleeve[s].total_pl += (t.net_pl || 0);
  }
  for (const s of Object.keys(bySleeve)) {
    bySleeve[s].win_rate = ((bySleeve[s].wins / bySleeve[s].trades) * 100).toFixed(1);
    bySleeve[s].total_pl = Math.round(bySleeve[s].total_pl * 100) / 100;
  }

  // Hold times
  const holdDays = closed
    .map(t => t.entry_date && t.exit_date ? (new Date(t.exit_date) - new Date(t.entry_date)) / 86400000 : null)
    .filter(d => d != null);
  const avgHold = holdDays.length ? holdDays.reduce((a, b) => a + b, 0) / holdDays.length : 0;

  return {
    total_trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    win_rate: parseFloat((wins.length / closed.length * 100).toFixed(1)),
    avg_win: parseFloat(avgWin.toFixed(2)),
    avg_loss: parseFloat(avgLoss.toFixed(2)),
    realised_rr: avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : null,
    profit_factor: parseFloat(profitFactor.toFixed(2)),
    expectancy_per_trade: parseFloat(expectancy.toFixed(2)),
    avg_hold_days: parseFloat(avgHold.toFixed(1)),
    by_sleeve: bySleeve,
  };
}

// ═══ BENCHMARK COMPARISON ═══
async function benchmarkVsSPX(navSeries, inceptionDate) {
  try {
    const startTs = Math.floor(new Date(inceptionDate).getTime() / 1000);
    const endTs = Math.floor(Date.now() / 1000);
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=${startTs}&period2=${endTs}&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
    if (closes.length < 2) return null;
    const spxReturn = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
    const fundReturn = navSeries.length ? ((navSeries[navSeries.length - 1].nav - navSeries[0].nav) / navSeries[0].nav) * 100 : 0;
    return {
      fund_return: parseFloat(fundReturn.toFixed(2)),
      spx_return: parseFloat(spxReturn.toFixed(2)),
      alpha: parseFloat((fundReturn - spxReturn).toFixed(2)),
      days: closes.length,
    };
  } catch { return null; }
}

// ═══ MAIN ═══
export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const state = await kvGet("apex:state");
    if (!state) return NextResponse.json({ error: "No state" }, { status: 404 });

    const navSeries = computeDailyNAV(state);
    const drawdown = computeDrawdown(navSeries);
    const monthly = computeMonthlyReturns(navSeries, state.deposits);
    const riskMetrics = computeSharpe(navSeries);
    const tradeStats = computeTradeStats(state.closed || []);
    const benchmark = await benchmarkVsSPX(navSeries, state.account?.inception_date);

    const maxDD = Math.min(...drawdown.map(d => d.drawdown_pct));
    const currentDD = drawdown[drawdown.length - 1]?.drawdown_pct || 0;

    // Hit rate summary
    const returnSinceInception = state.account?.total_deposited
      ? ((state.account.nav - state.account.total_deposited) / state.account.total_deposited) * 100
      : 0;

    return NextResponse.json({
      summary: {
        nav: state.account?.nav,
        total_deposited: state.account?.total_deposited,
        realised_pl: state.account?.total_realised_pl,
        return_since_inception_pct: parseFloat(returnSinceInception.toFixed(2)),
        days_running: Math.floor((Date.now() - new Date(state.account?.inception_date || "2026-03-17").getTime()) / 86400000),
        high_water_mark: state.account?.high_water_mark,
        current_drawdown_pct: currentDD,
        max_drawdown_pct: parseFloat(maxDD.toFixed(2)),
      },
      risk_metrics: riskMetrics,
      trade_stats: tradeStats,
      benchmark,
      equity_curve: navSeries,
      drawdown_curve: drawdown,
      monthly_returns: monthly,
      open_positions: state.positions?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
