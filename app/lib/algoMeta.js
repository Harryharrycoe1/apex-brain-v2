// APEX BRAIN V2 — ALGO META (Tier 5)
// Ensemble forecasting, CVaR, PCA, unified position sizing

// ═══ ENSEMBLE FORECASTING ═══
export function ensembleForecast(signals) {
  // Combine signals from different tiers with confidence weighting
  if (!signals?.length) return { direction: "NEUTRAL", confidence: 0, score: 50 };

  let weightedSum = 0, totalWeight = 0;

  for (const sig of signals) {
    const weight = (sig.confidence || 50) / 100;
    const direction = sig.bullish ? 1 : sig.bearish ? -1 : 0;
    weightedSum += direction * weight * (sig.strength || 1);
    totalWeight += weight;
  }

  const score = totalWeight > 0 ? (weightedSum / totalWeight + 1) / 2 * 100 : 50;
  const clampedScore = Math.max(0, Math.min(100, score));

  return {
    score: parseFloat(clampedScore.toFixed(1)),
    direction: clampedScore > 60 ? "BULLISH" : clampedScore < 40 ? "BEARISH" : "NEUTRAL",
    confidence: parseFloat((Math.abs(clampedScore - 50) * 2).toFixed(1)),
    signal_count: signals.length,
    consensus: signals.filter(s => s.bullish).length > signals.length * 0.7 ? "STRONG_BULL" :
      signals.filter(s => s.bearish).length > signals.length * 0.7 ? "STRONG_BEAR" : "MIXED",
  };
}

// ═══ CONDITIONAL VALUE AT RISK (CVaR / Expected Shortfall) ═══
export function cvar(returns, confidenceLevel = 0.95) {
  if (!returns?.length || returns.length < 20) return null;

  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.floor(sorted.length * (1 - confidenceLevel));
  const tailReturns = sorted.slice(0, Math.max(1, cutoff));
  const var95 = sorted[cutoff] || sorted[0];
  const cvarValue = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;

  return {
    var_95: parseFloat((var95 * 100).toFixed(2)),
    cvar_95: parseFloat((cvarValue * 100).toFixed(2)),
    worst_day: parseFloat((sorted[0] * 100).toFixed(2)),
    best_day: parseFloat((sorted[sorted.length - 1] * 100).toFixed(2)),
    tail_count: tailReturns.length,
    interpretation: `In the worst ${((1 - confidenceLevel) * 100).toFixed(0)}% of days, expect to lose ${Math.abs(cvarValue * 100).toFixed(2)}% on average`,
  };
}

// ═══ SIMPLIFIED PCA (Variance Decomposition) ═══
export function varianceDecomposition(returnSeries) {
  // returnSeries = { ticker: [returns], ... }
  const tickers = Object.keys(returnSeries);
  if (tickers.length < 2) return null;

  // Calculate correlation matrix
  const correlations = {};
  let avgCorr = 0, corrCount = 0;

  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const a = returnSeries[tickers[i]];
      const b = returnSeries[tickers[j]];
      const n = Math.min(a?.length || 0, b?.length || 0);
      if (n < 10) continue;

      const ar = a.slice(-n), br = b.slice(-n);
      const meanA = ar.reduce((s, v) => s + v, 0) / n;
      const meanB = br.reduce((s, v) => s + v, 0) / n;

      let cov = 0, varA = 0, varB = 0;
      for (let k = 0; k < n; k++) {
        const da = ar[k] - meanA, db = br[k] - meanB;
        cov += da * db;
        varA += da * da;
        varB += db * db;
      }
      const corr = (varA * varB > 0) ? cov / Math.sqrt(varA * varB) : 0;
      correlations[`${tickers[i]}_${tickers[j]}`] = parseFloat(corr.toFixed(3));
      avgCorr += Math.abs(corr);
      corrCount++;
    }
  }

  avgCorr = corrCount > 0 ? avgCorr / corrCount : 0;

  // Individual variances
  const variances = {};
  for (const t of tickers) {
    const r = returnSeries[t];
    if (!r?.length) continue;
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    variances[t] = parseFloat((Math.sqrt(r.reduce((a, v) => a + (v - mean) ** 2, 0) / r.length) * Math.sqrt(252) * 100).toFixed(1));
  }

  // Effective diversification ratio
  const diversificationRatio = avgCorr < 0.3 ? "GOOD" : avgCorr < 0.6 ? "MODERATE" : "POOR";

  return {
    correlations,
    avg_correlation: parseFloat(avgCorr.toFixed(3)),
    annualised_vols: variances,
    diversification: diversificationRatio,
    effective_positions: corrCount > 0 ? parseFloat((tickers.length / (1 + avgCorr * (tickers.length - 1))).toFixed(1)) : tickers.length,
    recommendation: avgCorr > 0.7 ? "HIGH CORRELATION — reduce position count or add uncorrelated assets" :
      avgCorr > 0.5 ? "Moderate correlation — consider hedges" :
      "Good diversification",
  };
}

// ═══ UNIFIED POSITION SIZING ═══
export function unifiedSizing(nav, ticker, conviction, volatility, kelly, regime) {
  const base = { 1: 0.05, 2: 0.10, 3: 0.15, 4: 0.20 };
  let allocation = base[conviction] || 0.10;

  // Adjust for volatility (reduce size for high vol)
  if (volatility > 40) allocation *= 0.7; // >40% annualised vol
  else if (volatility > 25) allocation *= 0.85;

  // Adjust for Kelly (if available)
  if (kelly?.adjusted && kelly.adjusted > 0) {
    const kellyAlloc = kelly.adjusted / 100;
    allocation = Math.min(allocation, kellyAlloc * 1.5); // Don't exceed 1.5x Kelly
  }

  // Adjust for regime
  if (regime === "CRISIS" || regime === "BEAR_VOLATILE") allocation *= 0.6;
  else if (regime === "BULL_CALM") allocation *= 1.1;

  // Hard caps
  allocation = Math.min(0.25, Math.max(0.03, allocation)); // 3-25% NAV

  const positionValue = nav * allocation;

  return {
    allocation_pct: parseFloat((allocation * 100).toFixed(1)),
    position_value_gbp: parseFloat(positionValue.toFixed(2)),
    conviction,
    adjustments: {
      volatility_adj: volatility > 25 ? "reduced" : "normal",
      kelly_adj: kelly?.adjusted ? `capped at ${kelly.adjusted}%` : "N/A",
      regime_adj: regime || "N/A",
    },
  };
}

// ═══ RISK BUDGET ═══
export function riskBudget(positions, nav, maxTotalRisk = 0.15) {
  let totalRiskPct = 0;
  const budget = [];

  for (const pos of positions) {
    const riskPct = pos.stop ? Math.abs((pos.entry_price - pos.stop) / pos.entry_price) : 0.1;
    const posSize = pos.units * pos.entry_price;
    const posRisk = posSize * riskPct;
    const riskOfNav = posRisk / nav;
    totalRiskPct += riskOfNav;

    budget.push({
      ticker: pos.id,
      risk_pct: parseFloat((riskOfNav * 100).toFixed(1)),
      risk_gbp: parseFloat(posRisk.toFixed(2)),
    });
  }

  return {
    total_risk_pct: parseFloat((totalRiskPct * 100).toFixed(1)),
    max_allowed: parseFloat((maxTotalRisk * 100).toFixed(1)),
    within_budget: totalRiskPct <= maxTotalRisk,
    remaining_budget_pct: parseFloat(((maxTotalRisk - totalRiskPct) * 100).toFixed(1)),
    positions: budget,
    recommendation: totalRiskPct > maxTotalRisk ? "OVER BUDGET — reduce positions or tighten stops" :
      totalRiskPct > maxTotalRisk * 0.8 ? "Near limit — be cautious adding" :
      "Within budget — room for more risk",
  };
}

// ═══ COMBINED TIER 5 ═══
export function runTier5(positions, returns, nav, kelly) {
  const ensemble = ensembleForecast([]);
  const risk = riskBudget(positions, nav);

  // CVaR from portfolio returns
  const allReturns = Object.values(returns || {}).flat().filter(r => isFinite(r));
  const cvarResult = allReturns.length > 20 ? cvar(allReturns) : null;

  return { ensemble, risk_budget: risk, cvar: cvarResult };
}
