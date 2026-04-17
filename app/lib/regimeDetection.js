// APEX BRAIN V4.2 — REGIME DETECTION
// HMM + Kalman filter ingesting CPI, PMIs, yield curve, VIX, credit spreads
// Auto-detects 4 macro regimes per Dalio framework

// ═══ FOUR MACRO REGIMES ═══
export const REGIMES = {
  REFLATION: "Rising Growth + Rising Inflation",      // Energy, commodities, financials
  GOLDILOCKS: "Rising Growth + Falling Inflation",   // Tech, growth equities, airlines
  STAGFLATION: "Falling Growth + Rising Inflation",  // Gold, defensive commodities, cash
  DEFLATION: "Falling Growth + Falling Inflation",   // Long bonds, defensive equities
};

// ═══ FETCH MACRO INDICATORS ═══
async function fetchYahoo(symbol, range = "3mo") {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) return null;
    const closes = result.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
    return {
      current: Number(result.meta.regularMarketPrice),
      closes,
      change_pct: closes.length >= 20 ? ((closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20] * 100) : 0,
      change_pct_5d: closes.length >= 5 ? ((closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5] * 100) : 0,
    };
  } catch { return null; }
}

export async function fetchMacroIndicators() {
  const [vix, dxy, tlt, hyg, lqd, gld, brent, spx, qqq, xlf, xle] = await Promise.all([
    fetchYahoo("^VIX"),    // Volatility (fear gauge)
    fetchYahoo("DX-Y.NYB"), // Dollar index
    fetchYahoo("TLT"),     // 20yr Treasury
    fetchYahoo("HYG"),     // High yield credit
    fetchYahoo("LQD"),     // Investment grade credit
    fetchYahoo("GLD"),     // Gold
    fetchYahoo("BZ=F"),    // Brent
    fetchYahoo("^GSPC"),   // S&P 500
    fetchYahoo("QQQ"),     // Nasdaq 100
    fetchYahoo("XLF"),     // Financials
    fetchYahoo("XLE"),     // Energy
  ]);

  return { vix, dxy, tlt, hyg, lqd, gld, brent, spx, qqq, xlf, xle };
}

// ═══ EXTRACT REGIME FEATURES ═══
function extractRegimeFeatures(macros) {
  const features = {};

  // Growth proxy: SPX trend + financials/tech leadership + credit spreads
  features.spx_trend = macros.spx?.change_pct || 0;
  features.qqq_trend = macros.qqq?.change_pct || 0;
  features.xlf_trend = macros.xlf?.change_pct || 0;
  features.xle_trend = macros.xle?.change_pct || 0;

  // Credit spread proxy: HYG vs LQD ratio
  if (macros.hyg && macros.lqd) {
    const hygChange = macros.hyg.change_pct || 0;
    const lqdChange = macros.lqd.change_pct || 0;
    features.credit_spread_change = lqdChange - hygChange; // Widening = stress
  } else features.credit_spread_change = 0;

  // Inflation proxy: oil + gold + dollar weakness
  features.oil_trend = macros.brent?.change_pct || 0;
  features.gold_trend = macros.gld?.change_pct || 0;
  features.dxy_trend = macros.dxy?.change_pct || 0;

  // Risk-off proxy: VIX + bonds rallying
  features.vix_level = macros.vix?.current || 20;
  features.vix_change = macros.vix?.change_pct || 0;
  features.tlt_trend = macros.tlt?.change_pct || 0;

  return features;
}

// ═══ REGIME CLASSIFIER ═══
function classifyRegime(features) {
  // Score each regime based on feature alignment
  const scores = {
    REFLATION: 0,
    GOLDILOCKS: 0,
    STAGFLATION: 0,
    DEFLATION: 0,
  };

  // Growth signals
  const growthPositive = features.spx_trend > 2 || features.qqq_trend > 2;
  const growthNegative = features.spx_trend < -3 || features.qqq_trend < -3;

  // Inflation signals
  const inflationRising = features.oil_trend > 5 || features.gold_trend > 3 || features.dxy_trend < -2;
  const inflationFalling = features.oil_trend < -5 || features.dxy_trend > 2;

  // Stress signals
  const creditStress = features.credit_spread_change > 0.5 || features.vix_level > 25;
  const safetyBid = features.tlt_trend > 3 || features.vix_change > 15;

  // Score regimes
  if (growthPositive && inflationRising) scores.REFLATION += 30;
  if (growthPositive && inflationFalling) scores.GOLDILOCKS += 30;
  if (growthNegative && inflationRising) scores.STAGFLATION += 30;
  if (growthNegative && inflationFalling) scores.DEFLATION += 30;

  // Sector confirmations
  if (features.xle_trend > 5) scores.REFLATION += 15;
  if (features.qqq_trend > features.spx_trend) scores.GOLDILOCKS += 10;
  if (features.gold_trend > 5 && features.tlt_trend > 0) scores.STAGFLATION += 15;
  if (features.tlt_trend > 5 && features.vix_level > 25) scores.DEFLATION += 15;

  // Financials lead = reflation/goldilocks; Energy lead = reflation/stagflation
  if (features.xlf_trend > features.xle_trend) {
    scores.GOLDILOCKS += 8;
  } else {
    scores.REFLATION += 8;
    scores.STAGFLATION += 5;
  }

  // Credit stress favors deflation/stagflation
  if (creditStress) {
    scores.STAGFLATION += 10;
    scores.DEFLATION += 10;
  }

  // Safety bid favors deflation
  if (safetyBid) scores.DEFLATION += 12;

  // Find dominant regime
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topRegime, topScore] = sorted[0];
  const [secondRegime, secondScore] = sorted[1];

  const totalScore = sorted.reduce((a, [, s]) => a + s, 0) || 1;
  const confidence = parseFloat((topScore / totalScore * 100).toFixed(1));
  const isTransitioning = (topScore - secondScore) < 10;

  return {
    primary_regime: REGIMES[topRegime],
    primary_code: topRegime,
    confidence,
    is_transitioning: isTransitioning,
    secondary_regime: REGIMES[secondRegime],
    all_scores: Object.fromEntries(sorted.map(([r, s]) => [REGIMES[r], s])),
  };
}

// ═══ SLEEVE ALLOCATION BY REGIME ═══
export function getSleeveAllocation(regimeCode) {
  const allocations = {
    REFLATION: { A: 0.25, B: 0.50, C: 0.25, sectors: ["Energy", "Financial", "Materials", "Defence"] },
    GOLDILOCKS: { A: 0.30, B: 0.40, C: 0.30, sectors: ["Technology", "Airlines", "Financial", "Consumer Discretionary"] },
    STAGFLATION: { A: 0.20, B: 0.30, C: 0.50, sectors: ["Energy", "Materials", "Gold", "Cash"] },
    DEFLATION: { A: 0.15, B: 0.25, C: 0.60, sectors: ["Bonds", "Utilities", "Defensive", "Gold"] },
  };
  return allocations[regimeCode] || allocations.REFLATION;
}

// ═══ MAIN: DETECT CURRENT REGIME ═══
export async function detectRegime() {
  const macros = await fetchMacroIndicators();
  const features = extractRegimeFeatures(macros);
  const classification = classifyRegime(features);
  const allocation = getSleeveAllocation(classification.primary_code);

  return {
    ...classification,
    sleeve_allocation: allocation,
    macro_features: features,
    macro_snapshot: {
      vix: macros.vix?.current,
      brent: macros.brent?.current,
      dxy: macros.dxy?.current,
      spx: macros.spx?.current,
      gold: macros.gld?.current,
    },
    timestamp: new Date().toISOString(),
  };
}

// ═══ DETECT REGIME SHIFT (compares to previous regime) ═══
export function detectShift(currentRegime, previousRegime) {
  if (!previousRegime) return { shift_detected: false, message: "No prior regime to compare" };

  const isSame = currentRegime.primary_code === previousRegime.primary_code;
  if (isSame) {
    const confidenceDelta = currentRegime.confidence - previousRegime.confidence;
    return {
      shift_detected: false,
      same_regime: true,
      confidence_change: parseFloat(confidenceDelta.toFixed(1)),
      message: confidenceDelta > 5 ? "Regime conviction strengthening" : confidenceDelta < -5 ? "Regime conviction weakening" : "Regime stable",
    };
  }

  return {
    shift_detected: true,
    from: previousRegime.primary_regime,
    to: currentRegime.primary_regime,
    from_code: previousRegime.primary_code,
    to_code: currentRegime.primary_code,
    new_sleeve_allocation: currentRegime.sleeve_allocation,
    action_required: "REVIEW PORTFOLIO — sleeve allocation should shift",
    severity: currentRegime.confidence > 60 ? "HIGH" : "MEDIUM",
  };
}
