// APEX BRAIN V5.0 — MULTI-STRATEGY ENGINE
// Beyond directional CFDs: pairs, hedges, drift, regime-conditional strategies
// V5.0 FIX S1: now imports unified SECTOR_MAP from scannerAdvanced.js instead of
// maintaining a 20-ticker hardcoded subset that disagreed with the scanner.

import { SECTOR_MAP } from "./scannerAdvanced.js";

// ═══ STRATEGY DEFINITIONS ═══
export const STRATEGIES = {
  DIRECTIONAL_CFD: {
    name: "Directional CFD",
    description: "Single-name long or short CFD with stop loss",
    best_regime: ["REFLATION", "GOLDILOCKS"],
    risk_profile: "MEDIUM-HIGH",
    typical_hold: "5-30 days",
    sleeve: "A or B",
  },
  PAIRS_TRADE: {
    name: "Pairs Trade",
    description: "Long strong stock + short weak stock in same sector — market-neutral",
    best_regime: ["GOLDILOCKS", "STAGFLATION"],
    risk_profile: "LOW-MEDIUM",
    typical_hold: "10-60 days",
    sleeve: "B",
  },
  CROSS_ASSET_HEDGE: {
    name: "Cross-Asset Hedge",
    description: "Long sector that benefits + short sector that suffers from same catalyst",
    best_regime: ["REFLATION", "STAGFLATION"],
    risk_profile: "LOW",
    typical_hold: "30-90 days",
    sleeve: "C",
  },
  EARNINGS_DRIFT: {
    name: "Post-Earnings Drift (PEAD)",
    description: "Buy quality companies after earnings beat — drift continues 20-60 days",
    best_regime: ["GOLDILOCKS", "REFLATION"],
    risk_profile: "MEDIUM",
    typical_hold: "20-60 days",
    sleeve: "A",
  },
  STRUCTURAL_LONG: {
    name: "Structural Long",
    description: "Multi-month thesis with macro tailwind",
    best_regime: ["ANY"],
    risk_profile: "MEDIUM",
    typical_hold: "60-365 days",
    sleeve: "C",
  },
  DEFENSIVE_HEDGE: {
    name: "Defensive Hedge",
    description: "Long bonds/gold + tighten stops on risk assets — risk-off positioning",
    best_regime: ["DEFLATION", "STAGFLATION"],
    risk_profile: "LOW",
    typical_hold: "30-180 days",
    sleeve: "C",
  },
  VOLATILITY_HEDGE: {
    name: "Volatility Hedge",
    description: "Long VIX or VIX futures via UVXY when complacency extreme",
    best_regime: ["GOLDILOCKS"],
    risk_profile: "HIGH",
    typical_hold: "5-15 days",
    sleeve: "A",
  },
};

// ═══ SECTOR ALIASING ═══
// Scanner's SECTOR_MAP uses specific labels (e.g. "Banks", "Semis", "Energy").
// Let user query a broader label like "Financial" and map to multiple scanner sectors.
const SECTOR_ALIASES = {
  Financial: ["Banks", "Brokers", "AssetMgr", "Consumer"],
  Technology: ["Tech", "Semis"],
  Tech: ["Tech", "Semis"],
  Energy: ["Energy"],
  EnergyServices: ["EnergyServices"],
  LNG: ["LNG", "NatGas"],
  Defence: ["Defence"],
  Airlines: ["Airlines"],
  Materials: ["Copper", "Mining", "GoldMiners", "Aluminum"],
  Gold: ["Gold", "GoldMiners"],
  Industrial: ["Industrial", "IndGas"],
  Banks: ["Banks"],
  Semis: ["Semis"],
};

function tickersInSector(label) {
  const targetSectors = SECTOR_ALIASES[label] || [label];
  const result = [];
  for (const [ticker, sector] of Object.entries(SECTOR_MAP)) {
    if (targetSectors.includes(sector)) result.push(ticker);
  }
  return result;
}

// ═══ PAIRS TRADE FINDER ═══
export function findPairsTrade(scannerResults, sector) {
  if (!scannerResults?.length) return null;

  const sectorTickers = tickersInSector(sector);
  if (sectorTickers.length < 2) return null;

  const sectorScores = scannerResults.filter(r => sectorTickers.includes(r.ticker));
  if (sectorScores.length < 2) return null;

  const sorted = [...sectorScores].sort((a, b) => b.score - a.score);
  const long = sorted[0];
  const short = sorted[sorted.length - 1];

  // Need meaningful divergence
  if (long.score - short.score < 20) return null;

  return {
    strategy: "PAIRS_TRADE",
    sector,
    long_leg: { ticker: long.ticker, score: long.score, grade: long.grade, sector: SECTOR_MAP[long.ticker] },
    short_leg: { ticker: short.ticker, score: short.score, grade: short.grade, sector: SECTOR_MAP[short.ticker] },
    score_spread: parseFloat((long.score - short.score).toFixed(1)),
    candidates_considered: sectorScores.length,
    rationale: `Long ${long.ticker} (${long.score}) / Short ${short.ticker} (${short.score}) — market-neutral exposure to ${sector} dispersion`,
    typical_size: "5-8% NAV combined (long + short notional)",
    risk_management: "Stop both legs if pair correlation breaks or score spread inverts",
  };
}

// ═══ CROSS-ASSET HEDGE FINDER ═══
export function findCrossAssetHedge(regimeCode) {
  const hedges = {
    REFLATION: {
      long: "Energy/Materials",
      short: "Long-duration bonds (TLT)",
      rationale: "Inflation rising → energy benefits, bonds suffer",
      tickers: { long: "XLE", short: "TLT" },
    },
    GOLDILOCKS: {
      long: "Tech/Airlines",
      short: "Energy",
      rationale: "Falling inflation + growth → tech leads, energy lags",
      tickers: { long: "QQQ", short: "XLE" },
    },
    STAGFLATION: {
      long: "Gold + Energy",
      short: "Consumer Discretionary",
      rationale: "Inflation + slowdown → real assets win, consumers suffer",
      tickers: { long: "GLD", short: "XLY" },
    },
    DEFLATION: {
      long: "Long-duration bonds (TLT)",
      short: "Financials",
      rationale: "Falling rates + slowdown → bonds rally, banks compressed",
      tickers: { long: "TLT", short: "XLF" },
    },
  };
  return hedges[regimeCode] || null;
}

// ═══ EARNINGS DRIFT SCREENER ═══
export function screenEarningsDrift(positions, earningsCalendar) {
  if (!earningsCalendar?.length) return [];

  const candidates = [];
  const now = Date.now();

  for (const earnings of earningsCalendar) {
    const earningsDate = new Date(earnings.date).getTime();
    const daysSince = (now - earningsDate) / 86400000;

    if (daysSince < 1 || daysSince > 30) continue;
    if (!earnings.surprise_pct || earnings.surprise_pct < 5) continue;

    if (positions.some(p => p.id === earnings.ticker)) continue;

    candidates.push({
      strategy: "EARNINGS_DRIFT",
      ticker: earnings.ticker,
      earnings_date: earnings.date,
      days_since: Math.floor(daysSince),
      surprise_pct: earnings.surprise_pct,
      drift_window_remaining: Math.max(0, 30 - daysSince),
      rationale: `Beat by ${earnings.surprise_pct}% — ${Math.floor(30 - daysSince)} days drift window remaining`,
      conviction: earnings.surprise_pct > 15 ? "HIGH" : earnings.surprise_pct > 8 ? "MEDIUM" : "LOW",
    });
  }

  return candidates.sort((a, b) => b.surprise_pct - a.surprise_pct);
}

// ═══ STRATEGY SELECTOR ═══
export function selectStrategies(regimeCode, scannerResults, positions, earningsCalendar = []) {
  const recommendations = [];

  // Directional: top 3 from scanner (if actionable)
  const topDirectional = (scannerResults || []).slice(0, 3);
  for (const opp of topDirectional) {
    if (opp.actionable) {
      recommendations.push({
        strategy: "DIRECTIONAL_CFD",
        ticker: opp.ticker,
        score: opp.score,
        sleeve: opp.score > 80 ? "A" : "B",
        rationale: `${opp.grade}-grade opportunity (${opp.score}/100), regime-aligned`,
      });
    }
  }

  // Cross-asset hedge for current regime
  const hedge = findCrossAssetHedge(regimeCode);
  if (hedge) {
    recommendations.push({
      strategy: "CROSS_ASSET_HEDGE",
      ...hedge,
      sleeve: "C",
      conviction: "STRUCTURAL",
    });
  }

  // Pairs trades in regime-relevant sectors
  // V5.0: use full scanner sector labels
  const sectorsByRegime = {
    GOLDILOCKS: ["Tech", "Semis", "Banks"],
    REFLATION: ["Energy", "EnergyServices", "Materials"],
    STAGFLATION: ["Energy", "Gold", "Materials"],
    DEFLATION: ["Banks", "Industrial"],
  };
  const sectorsToCheck = sectorsByRegime[regimeCode] || ["Energy", "Banks"];
  for (const sector of sectorsToCheck) {
    const pair = findPairsTrade(scannerResults, sector);
    if (pair) recommendations.push(pair);
  }

  // Earnings drift
  const drift = screenEarningsDrift(positions, earningsCalendar);
  for (const d of drift.slice(0, 2)) {
    recommendations.push(d);
  }

  // Defensive overlay if stagflation/deflation
  if (regimeCode === "DEFLATION" || regimeCode === "STAGFLATION") {
    recommendations.push({
      strategy: "DEFENSIVE_HEDGE",
      action: "Add TLT or GLD position, tighten stops on risk assets",
      sleeve: "C",
      conviction: "REGIME_DRIVEN",
    });
  }

  return {
    regime: regimeCode,
    total_recommendations: recommendations.length,
    recommendations,
    portfolio_construction: {
      directional: recommendations.filter(r => r.strategy === "DIRECTIONAL_CFD").length,
      pairs: recommendations.filter(r => r.strategy === "PAIRS_TRADE").length,
      hedges: recommendations.filter(r => r.strategy === "CROSS_ASSET_HEDGE" || r.strategy === "DEFENSIVE_HEDGE").length,
      drift: recommendations.filter(r => r.strategy === "EARNINGS_DRIFT").length,
    },
  };
}
