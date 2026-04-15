// APEX BRAIN V2 — ALGO ADVANCED (Tier 4)
// Kelly Criterion, HMM Regime, Hurst Exponent, Kalman Filter, Shannon Entropy

// ═══ KELLY CRITERION ═══
export function kellyCriterion(winRate, avgWin, avgLoss, maxFraction = 0.25) {
  // Kelly % = W - (1-W)/R where W = win rate, R = win/loss ratio
  if (!avgLoss || avgLoss === 0) return { kelly: 0, adjusted: 0, recommendation: "Insufficient data" };
  const W = winRate / 100;
  const R = Math.abs(avgWin / avgLoss);
  const kelly = W - ((1 - W) / R);
  // Half-Kelly for safety (standard practice)
  const halfKelly = kelly / 2;
  // Cap at maxFraction
  const adjusted = Math.max(0, Math.min(maxFraction, halfKelly));

  return {
    full_kelly: parseFloat((kelly * 100).toFixed(1)),
    half_kelly: parseFloat((halfKelly * 100).toFixed(1)),
    adjusted: parseFloat((adjusted * 100).toFixed(1)),
    recommendation: kelly <= 0 ? "DO NOT BET — negative expectancy" :
      adjusted < 5 ? "Small position (5% NAV max)" :
      adjusted < 15 ? "Standard position (10-15% NAV)" :
      "High conviction (15-25% NAV)",
    edge_exists: kelly > 0,
  };
}

// ═══ HMM REGIME DETECTION (Simplified Viterbi) ═══
export function detectRegime(returns, windowSize = 20) {
  if (!returns?.length || returns.length < windowSize * 2) return { regime: "UNKNOWN", confidence: 0 };

  const recent = returns.slice(-windowSize);
  const older = returns.slice(-windowSize * 2, -windowSize);

  const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderMean = older.reduce((a, b) => a + b, 0) / older.length;
  const recentVol = Math.sqrt(recent.reduce((a, b) => a + (b - recentMean) ** 2, 0) / recent.length);
  const olderVol = Math.sqrt(older.reduce((a, b) => a + (b - olderMean) ** 2, 0) / older.length);

  // Regime classification
  const meanThreshold = 0.001; // 0.1% daily
  const volRatio = recentVol / (olderVol || 0.01);

  let regime, confidence;
  if (recentMean > meanThreshold && volRatio < 1.3) {
    regime = "BULL_CALM"; confidence = 80;
  } else if (recentMean > meanThreshold && volRatio >= 1.3) {
    regime = "BULL_VOLATILE"; confidence = 65;
  } else if (recentMean < -meanThreshold && volRatio >= 1.3) {
    regime = "BEAR_VOLATILE"; confidence = 75;
  } else if (recentMean < -meanThreshold && volRatio < 1.3) {
    regime = "BEAR_CALM"; confidence = 60;
  } else if (volRatio > 2) {
    regime = "CRISIS"; confidence = 85;
  } else {
    regime = "SIDEWAYS"; confidence = 50;
  }

  // Transition detection
  const transition = Math.abs(recentMean - olderMean) > 0.005 ? "SHIFTING" : "STABLE";

  return {
    regime,
    confidence,
    transition,
    recent_mean: parseFloat((recentMean * 100).toFixed(3)),
    recent_vol: parseFloat((recentVol * 100).toFixed(3)),
    vol_ratio: parseFloat(volRatio.toFixed(2)),
    recommendation: regime === "CRISIS" ? "Reduce exposure, tighten stops" :
      regime === "BULL_CALM" ? "Full deployment, run winners" :
      regime === "BEAR_VOLATILE" ? "Defensive, raise cash" :
      "Standard operation",
  };
}

// ═══ HURST EXPONENT ═══
export function hurstExponent(series, maxLag = 20) {
  if (!series?.length || series.length < maxLag * 2) return { hurst: 0.5, interpretation: "Insufficient data" };

  const n = series.length;
  const lags = [];
  const rsValues = [];

  for (let lag = 2; lag <= Math.min(maxLag, Math.floor(n / 4)); lag++) {
    const chunks = Math.floor(n / lag);
    let totalRS = 0;
    let validChunks = 0;

    for (let c = 0; c < chunks; c++) {
      const chunk = series.slice(c * lag, (c + 1) * lag);
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      const deviations = chunk.map(v => v - mean);

      // Cumulative deviations
      const cumDev = [];
      let sum = 0;
      for (const d of deviations) { sum += d; cumDev.push(sum); }

      const R = Math.max(...cumDev) - Math.min(...cumDev);
      const S = Math.sqrt(deviations.reduce((a, d) => a + d * d, 0) / deviations.length);

      if (S > 0) {
        totalRS += R / S;
        validChunks++;
      }
    }

    if (validChunks > 0) {
      lags.push(Math.log(lag));
      rsValues.push(Math.log(totalRS / validChunks));
    }
  }

  if (lags.length < 3) return { hurst: 0.5, interpretation: "Insufficient data" };

  // Linear regression of log(R/S) vs log(lag)
  const n2 = lags.length;
  const sumX = lags.reduce((a, b) => a + b, 0);
  const sumY = rsValues.reduce((a, b) => a + b, 0);
  const sumXY = lags.reduce((a, x, i) => a + x * rsValues[i], 0);
  const sumX2 = lags.reduce((a, x) => a + x * x, 0);
  const hurst = (n2 * sumXY - sumX * sumY) / (n2 * sumX2 - sumX * sumX);

  return {
    hurst: parseFloat(Math.max(0, Math.min(1, hurst)).toFixed(3)),
    interpretation: hurst > 0.6 ? "TRENDING — momentum strategies favoured" :
      hurst < 0.4 ? "MEAN-REVERTING — contrarian strategies favoured" :
      "RANDOM WALK — no persistent pattern",
    trending: hurst > 0.55,
    mean_reverting: hurst < 0.45,
  };
}

// ═══ KALMAN FILTER (Simple 1D) ═══
export function kalmanFilter(observations, processNoise = 0.01, measureNoise = 0.1) {
  if (!observations?.length) return { filtered: [], trend: 0 };

  let estimate = observations[0];
  let errorEstimate = 1;
  const filtered = [];

  for (const obs of observations) {
    // Predict
    const predictedEstimate = estimate;
    const predictedError = errorEstimate + processNoise;

    // Update
    const kalmanGain = predictedError / (predictedError + measureNoise);
    estimate = predictedEstimate + kalmanGain * (obs - predictedEstimate);
    errorEstimate = (1 - kalmanGain) * predictedError;

    filtered.push(parseFloat(estimate.toFixed(4)));
  }

  // Trend = slope of last 5 filtered values
  const last5 = filtered.slice(-5);
  const trend = last5.length >= 2 ? (last5[last5.length - 1] - last5[0]) / last5[0] * 100 : 0;

  return {
    filtered,
    current: filtered[filtered.length - 1],
    trend: parseFloat(trend.toFixed(3)),
    trend_label: trend > 0.5 ? "UP" : trend < -0.5 ? "DOWN" : "FLAT",
  };
}

// ═══ SHANNON ENTROPY ═══
export function shannonEntropy(returns, bins = 10) {
  if (!returns?.length || returns.length < 20) return { entropy: 0, interpretation: "Insufficient data" };

  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const range = max - min || 0.01;
  const binWidth = range / bins;

  const counts = new Array(bins).fill(0);
  for (const r of returns) {
    const bin = Math.min(bins - 1, Math.floor((r - min) / binWidth));
    counts[bin]++;
  }

  const n = returns.length;
  let entropy = 0;
  for (const count of counts) {
    if (count > 0) {
      const p = count / n;
      entropy -= p * Math.log2(p);
    }
  }

  const maxEntropy = Math.log2(bins);
  const normalised = entropy / maxEntropy;

  return {
    entropy: parseFloat(entropy.toFixed(3)),
    normalised: parseFloat(normalised.toFixed(3)),
    max_entropy: parseFloat(maxEntropy.toFixed(3)),
    interpretation: normalised > 0.8 ? "HIGH UNCERTAINTY — market is random/chaotic" :
      normalised > 0.5 ? "MODERATE — some structure exists" :
      "LOW ENTROPY — strong pattern/trend present",
    predictability: parseFloat(((1 - normalised) * 100).toFixed(1)),
  };
}

// ═══ COMBINED TIER 4 ANALYSIS ═══
export function runTier4(closes, account) {
  if (!closes?.length || closes.length < 40) return null;

  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);

  const regime = detectRegime(returns);
  const hurst = hurstExponent(closes);
  const entropy = shannonEntropy(returns);
  const kalman = kalmanFilter(closes.slice(-30));

  // Kelly (using fund stats if available)
  let kelly = null;
  if (account?.total_trades > 5) {
    kelly = kellyCriterion(
      Number(account.win_rate) || 50,
      Number(account.avg_winner) || 5,
      Number(account.avg_loser) || -3,
    );
  }

  return { regime, hurst, entropy, kalman, kelly };
}
