// APEX BRAIN V2 — SCANNER ADVANCED (Levels 2-5)
// 22 modules for opportunity detection, signal generation, and scoring

// ═══ L2: REGIME-CONDITIONAL WEIGHTING ═══
export function regimeWeight(ticker, regime) {
  const weights = {
    "Rising Growth + Rising Inflation": { Financial: 1.3, Materials: 1.2, Energy: 1.1, Technology: 0.9, Bonds: 0.7, Airlines: 0.6 },
    "Rising Growth + Falling Inflation": { Technology: 1.4, Financial: 1.1, Airlines: 1.2, Bonds: 0.8, Energy: 0.7 },
    "Falling Growth + Rising Inflation": { Energy: 1.3, Materials: 1.2, Bonds: 0.9, Technology: 0.7, Financial: 0.6 },
    "Falling Growth + Falling Inflation": { Bonds: 1.5, Technology: 1.0, Financial: 0.7, Energy: 0.5 },
  };
  const sectorMap = {
    JPM: "Financial", BAC: "Financial", MS: "Financial", FCX: "Materials", COPX: "Materials",
    NVDA: "Technology", MSFT: "Technology", SMCI: "Technology", MPC: "Energy", CVX: "Energy",
    XOM: "Energy", LMT: "Defence", RTX: "Defence", GD: "Defence", DAL: "Airlines",
    UAL: "Airlines", IAG: "Airlines", TLT: "Bonds", EWJ: "International", GDX: "Materials",
  };
  const sector = sectorMap[ticker] || "Other";
  const regimeWeights = weights[regime] || {};
  return regimeWeights[sector] || 1.0;
}

// ═══ L2: SECTOR ROTATION SIGNAL ═══
export function sectorRotation(sectorPerformance) {
  // Rank sectors by recent performance, identify rotation direction
  const sorted = Object.entries(sectorPerformance).sort((a, b) => b[1] - a[1]);
  return {
    leading: sorted.slice(0, 3).map(([s]) => s),
    lagging: sorted.slice(-3).map(([s]) => s),
    rotation_signal: sorted[0]?.[1] > 0 && sorted[sorted.length - 1]?.[1] < 0 ? "ACTIVE" : "FLAT",
  };
}

// ═══ L2: POST-EARNINGS DRIFT (PEAD) ═══
export function peadSignal(ticker, earningsSurprise, daysSinceEarnings) {
  if (daysSinceEarnings > 60) return { signal: 0, reason: "Too far from earnings" };
  if (earningsSurprise > 10) return { signal: 1, reason: `Beat by ${earningsSurprise}% — drift likely continues 20-60 days` };
  if (earningsSurprise < -10) return { signal: -1, reason: `Missed by ${Math.abs(earningsSurprise)}% — negative drift likely` };
  return { signal: 0, reason: "Earnings in-line" };
}

// ═══ L3: RELATIVE STRENGTH ═══
export function relativeStrength(tickerReturn, benchmarkReturn) {
  const rs = tickerReturn - benchmarkReturn;
  return { rs, strong: rs > 5, weak: rs < -5, label: rs > 5 ? "OUTPERFORMING" : rs < -5 ? "UNDERPERFORMING" : "NEUTRAL" };
}

// ═══ L3: VOLUME DISTRIBUTION ═══
export function volumeAnalysis(volumes, avgVolume) {
  if (!volumes?.length || !avgVolume) return { signal: "NEUTRAL", ratio: 1 };
  const recent = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ratio = recent / avgVolume;
  if (ratio > 2.0) return { signal: "BREAKOUT_VOLUME", ratio: parseFloat(ratio.toFixed(2)) };
  if (ratio > 1.5) return { signal: "ABOVE_AVERAGE", ratio: parseFloat(ratio.toFixed(2)) };
  if (ratio < 0.5) return { signal: "DRYING_UP", ratio: parseFloat(ratio.toFixed(2)) };
  return { signal: "NORMAL", ratio: parseFloat(ratio.toFixed(2)) };
}

// ═══ L3: VOLATILITY COMPRESSION ═══
export function volCompression(atrHistory) {
  if (!atrHistory?.length || atrHistory.length < 10) return { compressed: false, ratio: 1 };
  const recent = atrHistory.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const older = atrHistory.slice(-20, -5).reduce((a, b) => a + b, 0) / 15;
  if (!older) return { compressed: false, ratio: 1 };
  const ratio = recent / older;
  return { compressed: ratio < 0.6, expanding: ratio > 1.5, ratio: parseFloat(ratio.toFixed(2)) };
}

// ═══ L3: CANDLE PATTERNS ═══
export function candlePattern(open, high, low, close, prevClose) {
  if (!open || !high || !low || !close) return { pattern: "NONE" };
  const body = Math.abs(close - open);
  const range = high - low;
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;

  if (range > 0 && body / range < 0.1 && lowerWick > body * 2) return { pattern: "HAMMER", bias: "BULLISH" };
  if (range > 0 && body / range < 0.1 && upperWick > body * 2) return { pattern: "SHOOTING_STAR", bias: "BEARISH" };
  if (close > open && body > range * 0.6 && close > prevClose * 1.02) return { pattern: "BULLISH_ENGULFING", bias: "BULLISH" };
  if (close < open && body > range * 0.6 && close < prevClose * 0.98) return { pattern: "BEARISH_ENGULFING", bias: "BEARISH" };
  if (range > 0 && body / range < 0.05) return { pattern: "DOJI", bias: "INDECISION" };
  return { pattern: "NONE", bias: "NEUTRAL" };
}

// ═══ L3: GAP CLASSIFICATION ═══
export function gapClassify(open, prevClose) {
  if (!open || !prevClose) return { type: "NONE", pct: 0 };
  const pct = ((open - prevClose) / prevClose) * 100;
  if (Math.abs(pct) < 0.5) return { type: "NONE", pct: 0 };
  if (pct > 3) return { type: "GAP_UP_LARGE", pct: parseFloat(pct.toFixed(2)), tradeable: true };
  if (pct > 0.5) return { type: "GAP_UP", pct: parseFloat(pct.toFixed(2)), tradeable: false };
  if (pct < -3) return { type: "GAP_DOWN_LARGE", pct: parseFloat(pct.toFixed(2)), tradeable: true };
  if (pct < -0.5) return { type: "GAP_DOWN", pct: parseFloat(pct.toFixed(2)), tradeable: false };
  return { type: "NONE", pct: 0 };
}

// ═══ L4: BAYESIAN FUSION ═══
export function bayesianFusion(signals) {
  // Combine multiple signal sources with Bayesian updating
  let logOdds = 0; // Start at 50/50
  for (const sig of signals) {
    const strength = sig.strength || 0.5;
    const direction = sig.bullish ? 1 : -1;
    logOdds += direction * Math.log(strength / (1 - strength + 0.001));
  }
  const probability = 1 / (1 + Math.exp(-logOdds));
  return {
    probability: parseFloat((probability * 100).toFixed(1)),
    conviction: probability > 0.7 ? "HIGH" : probability > 0.55 ? "MEDIUM" : "LOW",
    direction: probability > 0.55 ? "BULLISH" : probability < 0.45 ? "BEARISH" : "NEUTRAL",
  };
}

// ═══ L4: CONFIDENCE CALIBRATION ═══
export function calibrateConfidence(rawScore, sampleSize, regime) {
  // Discount confidence for small sample sizes and regime uncertainty
  const sampleDiscount = Math.min(1, sampleSize / 30); // Full confidence at 30+ samples
  const regimeDiscount = regime === "uncertain" ? 0.7 : 1.0;
  return parseFloat((rawScore * sampleDiscount * regimeDiscount).toFixed(1));
}

// ═══ L4: ANTI-CORRELATION FILTER ═══
export function antiCorrelation(candidate, existingPositions, maxCorrelation = 0.4) {
  const sectorMap = {
    JPM: "FIN", BAC: "FIN", MS: "FIN", FCX: "MAT", COPX: "MAT",
    NVDA: "TECH", MSFT: "TECH", SMCI: "TECH", MPC: "EN", CVX: "EN",
    TLT: "BOND", EWJ: "INTL", GDX: "MAT", XLU: "UTIL",
  };
  const candidateSector = sectorMap[candidate] || "OTHER";
  const sectorCounts = {};
  let total = existingPositions.length || 1;

  for (const p of existingPositions) {
    const s = sectorMap[p.id] || "OTHER";
    sectorCounts[s] = (sectorCounts[s] || 0) + 1;
  }

  const sameCount = sectorCounts[candidateSector] || 0;
  const correlation = sameCount / total;
  return {
    passes: correlation < maxCorrelation,
    correlation: parseFloat(correlation.toFixed(2)),
    same_sector_count: sameCount,
    detail: correlation >= maxCorrelation ? `Would push ${candidateSector} to ${((sameCount + 1) / (total + 1) * 100).toFixed(0)}% of portfolio` : "Diversification OK",
  };
}

// ═══ L4: OPPORTUNITY VELOCITY ═══
export function opportunityVelocity(priceHistory5d, priceHistory20d) {
  if (!priceHistory5d?.length || !priceHistory20d?.length) return { velocity: 0, accelerating: false };
  const recent = (priceHistory5d[priceHistory5d.length - 1] - priceHistory5d[0]) / priceHistory5d[0] * 100;
  const older = (priceHistory20d[priceHistory20d.length - 1] - priceHistory20d[0]) / priceHistory20d[0] * 100;
  return {
    velocity_5d: parseFloat(recent.toFixed(2)),
    velocity_20d: parseFloat(older.toFixed(2)),
    accelerating: Math.abs(recent) > Math.abs(older / 4), // 5d move > 25% of 20d move
  };
}

// ═══ L5: COMPOSITE SCORER ═══
export function compositeScore(ticker, signals, regime, existingPositions) {
  let score = 50; // Base

  // Regime fit
  const rw = regimeWeight(ticker, regime);
  score *= rw;

  // Signal aggregation
  for (const sig of signals) {
    if (sig.type === "momentum" && sig.value > 0) score += sig.value * 2;
    if (sig.type === "volume" && sig.value > 1.5) score += 10;
    if (sig.type === "pattern" && sig.bias === "BULLISH") score += 8;
    if (sig.type === "pead" && sig.value > 0) score += 15;
    if (sig.type === "relative_strength" && sig.value > 5) score += 10;
    if (sig.type === "vol_compression" && sig.compressed) score += 12;
  }

  // Anti-correlation bonus/penalty
  const acf = antiCorrelation(ticker, existingPositions);
  if (acf.passes) score += 5;
  else score -= 15;

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    ticker,
    score: parseFloat(score.toFixed(1)),
    grade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
    regime_weight: rw,
    correlation_check: acf,
    actionable: score >= 65,
  };
}

// ═══ SCAN UNIVERSE ═══
export function scanUniverse(tickers, priceData, regime, existingPositions) {
  const results = [];

  for (const ticker of tickers) {
    const p = priceData[ticker];
    if (!p?.price) continue;

    const signals = [];

    // Basic momentum from changePct
    if (p.changePct != null) {
      signals.push({ type: "momentum", value: p.changePct, bullish: p.changePct > 0, strength: Math.min(0.8, Math.abs(p.changePct) / 10 + 0.5) });
    }

    const result = compositeScore(ticker, signals, regime, existingPositions);
    results.push(result);
  }

  return results.sort((a, b) => b.score - a.score);
}
