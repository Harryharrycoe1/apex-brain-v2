// APEX BRAIN V4.9 — SCANNER ADVANCED (REWRITTEN)
// Transparent scoring. Every module documented and used in the main scan loop.
// No silent weights. No magic numbers without a comment.

// ═══ COMPLETE SECTOR MAP (all 100+ scan tickers) ═══
export const SECTOR_MAP = {
  // Energy - Oil
  XOM: "Energy", CVX: "Energy", COP: "Energy", OXY: "Energy", EOG: "Energy",
  MPC: "Energy", PSX: "Energy", VLO: "Energy", HES: "Energy", DVN: "Energy",
  SLB: "EnergyServices", HAL: "EnergyServices", BKR: "EnergyServices", NOV: "EnergyServices", FTI: "EnergyServices",
  // Natural gas & LNG
  EQT: "NatGas", AR: "NatGas", CHK: "NatGas", LNG: "LNG", GLNG: "LNG", TELL: "LNG", NFE: "LNG",
  // Defence
  LMT: "Defence", RTX: "Defence", GD: "Defence", NOC: "Defence", HII: "Defence",
  BA: "Defence", TXT: "Defence", TDG: "Defence", AVAV: "Defence",
  // Airlines
  DAL: "Airlines", UAL: "Airlines", AAL: "Airlines", LUV: "Airlines",
  ALK: "Airlines", JBLU: "Airlines", SAVE: "Airlines", IAG: "Airlines",
  // Materials / Copper / Gold miners
  FCX: "Copper", COPX: "Copper", SCCO: "Copper", BHP: "Mining", RIO: "Mining",
  GDX: "GoldMiners", GDXJ: "GoldMiners", NEM: "GoldMiners", AEM: "GoldMiners", HL: "GoldMiners",
  AA: "Aluminum", CENX: "Aluminum",
  // Semiconductors
  NVDA: "Semis", AMD: "Semis", AVGO: "Semis", SMCI: "Semis", TSM: "Semis",
  QCOM: "Semis", INTC: "Semis", MU: "Semis", AMAT: "Semis", KLAC: "Semis", LRCX: "Semis",
  // Software / Cloud / Mega-cap tech
  MSFT: "Tech", GOOGL: "Tech", AMZN: "Tech", META: "Tech",
  ORCL: "Tech", CRM: "Tech", PLTR: "Tech", NOW: "Tech",
  // Financials - Big banks
  JPM: "Banks", BAC: "Banks", MS: "Banks", GS: "Banks", WFC: "Banks",
  C: "Banks", BK: "Banks", USB: "Banks", PNC: "Banks",
  // Financials - Other
  SCHW: "Brokers", COF: "Consumer", TFC: "Banks", AXP: "Consumer", BLK: "AssetMgr",
  // Industrial gases & Industrials
  APD: "IndGas", LIN: "IndGas",
  CAT: "Industrial", DE: "Industrial", HON: "Industrial", GE: "Industrial", ETN: "Industrial", PH: "Industrial",
  // Defensives
  XLU: "Utilities", VNQ: "REIT", KO: "Staples", PG: "Staples", WMT: "Staples", COST: "Staples",
  JNJ: "Healthcare", PFE: "Healthcare", MRK: "Healthcare",
  // Bonds / Gold / Commodities ETFs
  TLT: "LongBonds", IEF: "MidBonds", SHY: "ShortBonds",
  GLD: "Gold", SLV: "Silver",
  DBC: "Commodities", USO: "OilETF", UNG: "NatGasETF",
  // International
  EWJ: "Japan", FXI: "China", EWU: "UK", EWG: "Germany", EWW: "Mexico", EEM: "EM",
  // Volatility / Inverse
  VXX: "VolETF", SH: "InverseSPX",
};

// ═══ HIGH-LEVEL THEMES (for correlation at theme level, tighter than sector) ═══
export const THEME_MAP = {
  Energy: "Energy", EnergyServices: "Energy", OilETF: "Energy",
  NatGas: "Energy", LNG: "Energy", NatGasETF: "Energy",
  Defence: "Defence",
  Airlines: "Cyclical_Consumer",
  Copper: "Metals", Mining: "Metals", Aluminum: "Metals",
  GoldMiners: "Gold", Gold: "Gold", Silver: "Gold",
  Semis: "Tech_Hardware", Tech: "Tech_Software",
  Banks: "Financials", Brokers: "Financials", AssetMgr: "Financials", Consumer: "Financials",
  IndGas: "Industrials", Industrial: "Industrials",
  Utilities: "Defensive", REIT: "Defensive", Staples: "Defensive", Healthcare: "Defensive",
  LongBonds: "Rates", MidBonds: "Rates", ShortBonds: "Rates",
  Commodities: "Commodities",
  Japan: "Intl", China: "Intl", UK: "Intl", Germany: "Intl", Mexico: "Intl", EM: "Intl",
  VolETF: "Hedge", InverseSPX: "Hedge",
};

// ═══ REGIME-CONDITIONAL SECTOR WEIGHTS ═══
// Each weight is a multiplier on the base score. >1 = favoured in this regime.
export const REGIME_WEIGHTS = {
  REFLATION: {  // Rising growth + rising inflation
    Energy: 1.3, EnergyServices: 1.25, NatGas: 1.3, LNG: 1.3,
    Copper: 1.25, Mining: 1.2, Aluminum: 1.15,
    Banks: 1.2, Brokers: 1.15,
    Industrial: 1.15, IndGas: 1.1,
    Semis: 0.85, Tech: 0.85,
    LongBonds: 0.7, MidBonds: 0.75, Gold: 1.0, GoldMiners: 1.05,
    Utilities: 0.8, REIT: 0.75, Staples: 0.85,
    Airlines: 0.8, // high oil cost hurts margins
  },
  GOLDILOCKS: {  // Rising growth + falling inflation
    Tech: 1.4, Semis: 1.35,
    Banks: 1.15, Brokers: 1.2, Consumer: 1.2,
    Airlines: 1.3, // cheap fuel, strong demand
    Industrial: 1.1,
    Energy: 0.8, NatGas: 0.8,
    GoldMiners: 0.7, Gold: 0.75,
    LongBonds: 0.9, Utilities: 0.9,
  },
  STAGFLATION: {  // Falling growth + rising inflation
    Energy: 1.25, Commodities: 1.25, OilETF: 1.2,
    Gold: 1.4, GoldMiners: 1.35, Silver: 1.3,
    Defence: 1.1, // safe-ish in geopolitical tension
    LongBonds: 0.85, // inflation hurts bonds
    Tech: 0.7, Semis: 0.7,
    Banks: 0.8, Airlines: 0.65,
    Staples: 1.05, Utilities: 1.0,
  },
  DEFLATION: {  // Falling growth + falling inflation
    LongBonds: 1.5, MidBonds: 1.3, ShortBonds: 1.1,
    Utilities: 1.25, Staples: 1.15, Healthcare: 1.2, REIT: 1.1,
    Gold: 1.15,
    Tech: 0.9, Semis: 0.85, Banks: 0.65,
    Energy: 0.6, NatGas: 0.6, Airlines: 0.7,
    Industrial: 0.8, Copper: 0.7,
  },
};

export function regimeWeight(ticker, regimeCode) {
  const sector = SECTOR_MAP[ticker];
  if (!sector) return 1.0; // Unknown ticker
  const code = regimeCode?.toUpperCase().replace(/\s.*/, "") || "REFLATION";
  return REGIME_WEIGHTS[code]?.[sector] ?? 1.0;
}

// ═══ RSI-BASED MOMENTUM ═══
// Context-aware: overbought in an uptrend is NOT automatically bearish
export function rsiSignal(rsi, trendDirection) {
  if (rsi == null) return { value: 0, direction: "neutral", strength: 0 };
  // In confirmed uptrend, RSI > 70 is CONFIRMATION, not mean-revert signal
  if (rsi > 75) {
    if (trendDirection === "long") return { value: 0.4, direction: "long", strength: 0.7, reason: "Strong momentum in uptrend" };
    return { value: -0.3, direction: "short", strength: 0.5, reason: "Overbought in no trend — mean revert" };
  }
  if (rsi > 60) return { value: 0.6, direction: "long", strength: 0.7, reason: "Bullish momentum" };
  if (rsi > 50) return { value: 0.3, direction: "long", strength: 0.5, reason: "Mild bullish" };
  if (rsi > 40) return { value: -0.3, direction: "short", strength: 0.5, reason: "Mild bearish" };
  if (rsi > 25) {
    if (trendDirection === "short") return { value: -0.4, direction: "short", strength: 0.7, reason: "Strong momentum in downtrend" };
    return { value: -0.6, direction: "short", strength: 0.7, reason: "Bearish momentum" };
  }
  return { value: 0.5, direction: "long", strength: 0.6, reason: "Oversold — bounce potential" };
}

// ═══ TREND ALIGNMENT SIGNAL (multi-timeframe) ═══
// This is the dominant factor — weighted more heavily than mean-revert signals
export function trendSignal(price, sma20, sma50, sma200, weeklySMA20, weeklySMA50) {
  let score = 0;
  const reasons = [];

  if (sma20 && sma50) {
    if (sma20 > sma50) { score += 0.35; reasons.push("SMA20>SMA50 (daily bull)"); }
    else { score -= 0.35; reasons.push("SMA20<SMA50 (daily bear)"); }
  }
  if (sma200) {
    if (price > sma200) { score += 0.4; reasons.push("price > SMA200 (LT bull)"); }
    else { score -= 0.4; reasons.push("price < SMA200 (LT bear)"); }
  }
  if (weeklySMA20 && weeklySMA50) {
    if (weeklySMA20 > weeklySMA50) { score += 0.5; reasons.push("weekly bull (MTF)"); }
    else { score -= 0.5; reasons.push("weekly bear (MTF)"); }
  }
  const dailyBull = sma20 && sma50 ? sma20 > sma50 : null;
  const weeklyBull = weeklySMA20 && weeklySMA50 ? weeklySMA20 > weeklySMA50 : null;
  const mtfAligned = dailyBull != null && weeklyBull != null && dailyBull === weeklyBull;
  if (mtfAligned) { score *= 1.3; reasons.push("MTF aligned — amplified"); }

  return {
    score: parseFloat(score.toFixed(3)),
    direction: score > 0.15 ? "long" : score < -0.15 ? "short" : "neutral",
    mtf_aligned: mtfAligned,
    reasons,
  };
}

// ═══ VOLUME CONFIRMATION ═══
export function volumeSignal(volRatio, changePct) {
  if (!volRatio) return { score: 0, signal: "no_data" };
  if (volRatio > 2.0 && Math.abs(changePct) > 1) {
    return { score: changePct > 0 ? 0.4 : -0.4, signal: "BREAKOUT_VOL", reason: "2x+ volume on material move" };
  }
  if (volRatio > 1.5) return { score: changePct > 0 ? 0.2 : -0.2, signal: "ABOVE_AVG" };
  if (volRatio < 0.5) return { score: -0.1, signal: "DRYING_UP", reason: "Low volume — interest fading" };
  return { score: 0, signal: "NORMAL" };
}

// ═══ RANGE POSITION ═══
export function rangePosition(price, swingLow, swingHigh) {
  const range = swingHigh - swingLow;
  if (range <= 0) return { pos: 0.5, score: 0 };
  const pos = (price - swingLow) / range;
  // Bull setups favoured in upper range; short setups in lower range
  if (pos > 0.75) return { pos, score: 0.15, reason: "Near range high — momentum" };
  if (pos > 0.55) return { pos, score: 0.1 };
  if (pos < 0.25) return { pos, score: -0.15, reason: "Near range low — downtrend" };
  if (pos < 0.45) return { pos, score: -0.1 };
  return { pos, score: 0 };
}

// ═══ COVARIANCE-BASED CORRELATION CHECK ═══
// Rather than just sector counting, use theme map for tighter grouping
export function correlationCheck(candidate, existingPositions) {
  const candidateSector = SECTOR_MAP[candidate] || "Other";
  const candidateTheme = THEME_MAP[candidateSector] || candidateSector;
  const total = existingPositions.length;
  if (total === 0) return { passes: true, sector_count: 0, theme_count: 0, warning: null };

  let sameSector = 0, sameTheme = 0;
  for (const pos of existingPositions) {
    const s = SECTOR_MAP[pos.id] || "Other";
    const t = THEME_MAP[s] || s;
    if (s === candidateSector) sameSector++;
    if (t === candidateTheme) sameTheme++;
  }

  const themePct = sameTheme / (total + 1); // What % after adding this one

  return {
    sector: candidateSector,
    theme: candidateTheme,
    sector_count: sameSector,
    theme_count: sameTheme,
    theme_pct_if_added: parseFloat(themePct.toFixed(2)),
    // Rule 7: max 40% in any single theme
    passes: themePct < 0.4 && sameSector < 3,
    warning: themePct >= 0.4 ? `Adding pushes ${candidateTheme} theme to ${(themePct * 100).toFixed(0)}% (R7: max 40%)` :
             sameSector >= 3 ? `Already 3+ in ${candidateSector} — concentration` :
             sameSector >= 2 ? `2 positions in ${candidateSector} already` : null,
  };
}

// ═══ CANDLESTICK PATTERN DETECTION (kept for chart-reading signal) ═══
export function candlePattern(open, high, low, close, prevClose) {
  if (!open || !high || !low || !close) return { pattern: null, score: 0 };
  const body = Math.abs(close - open);
  const range = high - low;
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  if (range === 0) return { pattern: null, score: 0 };

  if (body / range < 0.1 && lowerWick > body * 2) return { pattern: "HAMMER", score: 0.15, bias: "bull" };
  if (body / range < 0.1 && upperWick > body * 2) return { pattern: "SHOOTING_STAR", score: -0.15, bias: "bear" };
  if (close > open && body > range * 0.6 && close > prevClose * 1.02) return { pattern: "BULL_ENGULF", score: 0.2, bias: "bull" };
  if (close < open && body > range * 0.6 && close < prevClose * 0.98) return { pattern: "BEAR_ENGULF", score: -0.2, bias: "bear" };
  return { pattern: null, score: 0 };
}

// ═══ MASTER SCORER — TRANSPARENT, EVERY SIGNAL NAMED ═══
// Returns {score 0-100, direction, grade, breakdown, reasons}
export function scoreOpportunity(ticker, priceData, regimeCode, existingPositions) {
  if (!priceData?.price) return null;
  const { price, changePct, rsi, sma20, sma50, sma200, weeklySMA20, weeklySMA50, volRatio, swingLow, swingHigh, open, high, low, close, prevClose } = priceData;

  const signals = {};
  let bullStrength = 0, bearStrength = 0;

  // 1. Trend (multi-timeframe) — compute first, as RSI depends on trend direction
  const tr = trendSignal(price, sma20, sma50, sma200, weeklySMA20, weeklySMA50);
  signals.trend = tr;
  if (tr.score > 0) bullStrength += tr.score; else bearStrength += Math.abs(tr.score);

  // 2. RSI momentum (context-aware: uses trend direction to interpret overbought/oversold)
  const rsiS = rsiSignal(rsi, tr.direction);
  signals.rsi = rsiS;
  if (rsiS.direction === "long") bullStrength += rsiS.value;
  else if (rsiS.direction === "short") bearStrength += Math.abs(rsiS.value);

  // 3. Volume confirmation
  const volS = volumeSignal(volRatio, changePct);
  signals.volume = volS;
  if (volS.score > 0) bullStrength += volS.score; else bearStrength += Math.abs(volS.score);

  // 4. Range position
  const rangeS = rangePosition(price, swingLow, swingHigh);
  signals.range = rangeS;
  if (rangeS.score > 0) bullStrength += rangeS.score; else bearStrength += Math.abs(rangeS.score);

  // 5. Candle pattern
  const candleS = candlePattern(open, high, low, close, prevClose);
  signals.candle = candleS;
  if (candleS.score > 0) bullStrength += candleS.score; else bearStrength += Math.abs(candleS.score);

  // 6. Recent momentum
  const momScore = Math.max(-0.3, Math.min(0.3, (changePct || 0) / 10));
  signals.momentum = { score: momScore, changePct };
  if (momScore > 0) bullStrength += momScore; else bearStrength += Math.abs(momScore);

  // Direction
  const totalStrength = bullStrength + bearStrength;
  if (totalStrength === 0) return null;
  const bullRatio = bullStrength / totalStrength;
  const direction = bullRatio > 0.55 ? "buy" : bullRatio < 0.45 ? "short" : "neutral";
  if (direction === "neutral") return null;

  const confidence = Math.abs(bullRatio - 0.5) * 2; // 0 to 1

  // Regime weight (sector vs current macro regime) — direction-aware
  // If regime favours sector (mult > 1) and we're LONG: boost
  // If regime penalises sector (mult < 1) and we're SHORT: boost (shorting a weak sector is good)
  const baseRegimeMult = regimeWeight(ticker, regimeCode);
  const regimeMult = direction === "buy" ? baseRegimeMult : (baseRegimeMult < 1 ? 1 + (1 - baseRegimeMult) : 1 / baseRegimeMult);

  // Correlation check
  const corr = correlationCheck(ticker, existingPositions);

  // Base score: confidence 0-100
  let score = confidence * 100;

  // Regime multiplier (direction-aware)
  score *= regimeMult;

  // Correlation penalty
  if (!corr.passes) score *= 0.5;

  // Volume confirmation bonus (critical for breakouts)
  if (volS.signal === "BREAKOUT_VOL" && ((direction === "buy" && changePct > 0) || (direction === "short" && changePct < 0))) {
    score += 8;
  }

  // MTF alignment bonus
  if (tr.mtf_aligned && ((direction === "buy" && tr.direction === "long") || (direction === "short" && tr.direction === "short"))) {
    score += 6;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    ticker,
    score: parseFloat(score.toFixed(1)),
    direction,
    confidence: parseFloat(confidence.toFixed(2)),
    bull_strength: parseFloat(bullStrength.toFixed(2)),
    bear_strength: parseFloat(bearStrength.toFixed(2)),
    regime_multiplier: regimeMult,
    sector: SECTOR_MAP[ticker] || "Other",
    theme: THEME_MAP[SECTOR_MAP[ticker]] || "Other",
    correlation: corr,
    grade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
    actionable: score >= 65 && confidence >= 0.25 && corr.passes,
    signals,
  };
}

// ═══ MAIN SCAN LOOP ═══
export function scanUniverse(tickers, priceData, regimeCode, existingPositions) {
  const results = [];
  for (const ticker of tickers) {
    const r = scoreOpportunity(ticker, priceData[ticker], regimeCode, existingPositions);
    if (r) results.push(r);
  }
  return results.sort((a, b) => b.score - a.score);
}
