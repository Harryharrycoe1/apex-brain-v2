// APEX BRAIN V4.5 — REALISTIC COST MODELING
// Models T212 CFD spread, overnight financing, FX conversion, slippage
// Every backtest reflects realistic P&L

// ═══ T212 CFD COST PARAMETERS ═══
const T212_COSTS = {
  // Spread (bps of price)
  spread_bps: {
    large_cap_us: 5,     // JPM, MSFT, etc — tight spread
    mid_cap_us: 12,      // Smaller US names
    uk_cfd: 10,          // IAG, etc
    energy_cfd: 8,       // CVX, MPC, XOM
    commodity_cfd: 15,   // Brent, gold
    forex: 3,            // GBPUSD
    index_cfd: 2,        // SPX500
  },
  // Overnight financing (annualised %)
  overnight_financing_long: 0.075,  // ~7.5% APR for long CFDs
  overnight_financing_short: 0.045, // Lower for shorts (you receive interest in some cases)
  // FX conversion (T212 charges 0.15% on currency conversion for non-£ trades)
  fx_conversion_pct: 0.0015,
  // Slippage on entry/exit (typical retail)
  slippage_bps: 3,
};

// ═══ CLASSIFY TICKER FOR SPREAD ═══
function classifyTicker(ticker) {
  const energyTickers = ["CVX", "MPC", "XOM", "SLB", "HAL", "GLNG", "LNG", "EQT"];
  const largeCapUS = ["JPM", "BAC", "MS", "MSFT", "NVDA", "AVGO", "AAPL", "GOOG", "META"];
  const ukCfd = ["IAG", "VOD", "BARC"];
  const indexCfd = ["SPX500", "US100", "UK100"];
  const commodityCfd = ["BRENT", "WTI", "GOLD", "SILVER"];
  const forex = ["GBPUSD", "EURUSD", "USDJPY"];

  const t = ticker.toUpperCase();
  if (energyTickers.includes(t)) return "energy_cfd";
  if (largeCapUS.includes(t)) return "large_cap_us";
  if (ukCfd.includes(t)) return "uk_cfd";
  if (indexCfd.includes(t)) return "index_cfd";
  if (commodityCfd.includes(t)) return "commodity_cfd";
  if (forex.includes(t)) return "forex";
  return "mid_cap_us";
}

// ═══ CALCULATE SPREAD COST ═══
export function spreadCost(ticker, price, units) {
  const category = classifyTicker(ticker);
  const spreadBps = T212_COSTS.spread_bps[category] || 12;
  const spreadPerUnit = (price * spreadBps) / 10000;
  return {
    spread_per_unit: parseFloat(spreadPerUnit.toFixed(4)),
    total_spread_cost: parseFloat((spreadPerUnit * units).toFixed(2)),
    spread_bps: spreadBps,
    category,
  };
}

// ═══ CALCULATE OVERNIGHT FINANCING ═══
export function overnightFinancing(ticker, price, units, daysHeld, direction = "buy") {
  if (daysHeld <= 0) return { total: 0, daily: 0, days: 0 };

  const isShort = direction === "short" || direction === "sell";
  const annualRate = isShort ? T212_COSTS.overnight_financing_short : T212_COSTS.overnight_financing_long;
  const positionValue = price * units;
  const dailyCost = (positionValue * annualRate) / 365;
  const totalCost = dailyCost * daysHeld;

  return {
    daily: parseFloat(dailyCost.toFixed(2)),
    total: parseFloat(totalCost.toFixed(2)),
    days: daysHeld,
    annual_rate: annualRate,
    position_value: parseFloat(positionValue.toFixed(2)),
  };
}

// ═══ FX CONVERSION COST ═══
export function fxCost(positionValueUsd, gbpUsd = 1.34) {
  const positionValueGbp = positionValueUsd / gbpUsd;
  const fxCharge = positionValueGbp * T212_COSTS.fx_conversion_pct * 2; // Round trip
  return {
    fx_charge_gbp: parseFloat(fxCharge.toFixed(2)),
    rate: T212_COSTS.fx_conversion_pct,
  };
}

// ═══ SLIPPAGE ESTIMATE ═══
export function slippage(price, units) {
  const slippagePerUnit = (price * T212_COSTS.slippage_bps) / 10000;
  return {
    per_unit: parseFloat(slippagePerUnit.toFixed(4)),
    total: parseFloat((slippagePerUnit * units * 2).toFixed(2)), // Entry + exit
  };
}

// ═══ FULL TRADE COST CALCULATION ═══
export function calculateTradeCosts(ticker, entryPrice, exitPrice, units, direction = "buy", daysHeld = 0, currency = "USD") {
  const spread = spreadCost(ticker, entryPrice, units);
  const financing = overnightFinancing(ticker, entryPrice, units, daysHeld, direction);
  const slip = slippage(entryPrice, units);
  const fx = currency !== "GBP" ? fxCost(entryPrice * units) : { fx_charge_gbp: 0 };

  // Gross P&L (no costs)
  const grossPL = direction === "short"
    ? (entryPrice - exitPrice) * units
    : (exitPrice - entryPrice) * units;

  // Total costs
  const totalCostUsd = spread.total_spread_cost + financing.total + slip.total;
  const totalCostGbp = (currency !== "GBP" ? totalCostUsd / 1.34 : totalCostUsd) + fx.fx_charge_gbp;

  // Net P&L
  const netPL_usd = grossPL - totalCostUsd;
  const netPL_gbp = currency === "GBP" ? netPL_usd : (netPL_usd / 1.34) - fx.fx_charge_gbp;

  return {
    gross_pl_usd: parseFloat(grossPL.toFixed(2)),
    spread_cost: spread,
    financing_cost: financing,
    slippage_cost: slip,
    fx_cost: fx,
    total_costs_usd: parseFloat(totalCostUsd.toFixed(2)),
    total_costs_gbp: parseFloat(totalCostGbp.toFixed(2)),
    net_pl_usd: parseFloat(netPL_usd.toFixed(2)),
    net_pl_gbp: parseFloat(netPL_gbp.toFixed(2)),
    cost_drag_pct: grossPL !== 0 ? parseFloat((totalCostUsd / Math.abs(grossPL) * 100).toFixed(1)) : 0,
  };
}

// ═══ ADJUSTED BACKTEST ═══
// Wraps existing backtest results with realistic costs
export function adjustBacktestForCosts(backtestResults, ticker, avgPositionSize = 100) {
  if (!backtestResults) return null;

  const category = classifyTicker(ticker);
  const spreadBps = T212_COSTS.spread_bps[category] || 12;

  // Average cost drag per trade (bps)
  const avgHoldDays = backtestResults.hold_days || 5;
  const avgFinancingDrag = (T212_COSTS.overnight_financing_long * avgHoldDays / 365) * 100; // %
  const avgSpreadDrag = (spreadBps + T212_COSTS.slippage_bps) / 100; // %

  const totalCostDrag = avgSpreadDrag + avgFinancingDrag;

  // Adjust expectancy
  const adjustedExpectancy = backtestResults.expectancy - totalCostDrag;
  const adjustedAvgWin = backtestResults.avg_win - totalCostDrag;
  const adjustedAvgLoss = backtestResults.avg_loss - totalCostDrag;

  return {
    ...backtestResults,
    raw_expectancy: backtestResults.expectancy,
    cost_drag_pct: parseFloat(totalCostDrag.toFixed(2)),
    spread_drag_pct: parseFloat(avgSpreadDrag.toFixed(2)),
    financing_drag_pct: parseFloat(avgFinancingDrag.toFixed(2)),
    adjusted_expectancy: parseFloat(adjustedExpectancy.toFixed(2)),
    adjusted_avg_win: parseFloat(adjustedAvgWin.toFixed(2)),
    adjusted_avg_loss: parseFloat(adjustedAvgLoss.toFixed(2)),
    profitable_after_costs: adjustedExpectancy > 0,
  };
}

export const COST_PARAMS = T212_COSTS;
