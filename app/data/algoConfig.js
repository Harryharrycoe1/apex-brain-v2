// APEX BRAIN V5.0 — ALGO CONFIG
// Watchlist, earnings, thresholds for algo engine + scanner
//
// V5.0 NOTE: EARNINGS_CALENDAR is kept but status fields updated to reflect
// reality (Apr 15/16 earnings already passed). Scanner fetches earnings
// dates live from Yahoo quoteSummary, so this constant is advisory only.

export const WATCHLIST = {
  // === HELD POSITIONS ===
  JPM: { yahoo: "JPM", name: "JPMorgan Chase", sector: "Financial", held: true },
  BAC: { yahoo: "BAC", name: "Bank of America", sector: "Financial", held: true },
  FCX: { yahoo: "FCX", name: "Freeport-McMoRan", sector: "Materials", held: true },
  // === PIPELINE (deploying this week) ===
  NVDA: { yahoo: "NVDA", name: "Nvidia", sector: "Technology", held: false },
  MSFT: { yahoo: "MSFT", name: "Microsoft", sector: "Technology", held: false },
  MS: { yahoo: "MS", name: "Morgan Stanley", sector: "Financial", held: false },
  SMCI: { yahoo: "SMCI", name: "Super Micro Computer", sector: "Technology", held: false },
  COPX: { yahoo: "COPX", name: "Global X Copper Miners ETF", sector: "Materials", held: false },
  EWJ: { yahoo: "EWJ", name: "iShares MSCI Japan ETF", sector: "International", held: false },
  TLT: { yahoo: "TLT", name: "iShares 20+ Year Treasury", sector: "Bonds", held: false },
  // === MACRO ===
  BRENT: { yahoo: "BZ=F", name: "Brent Crude", sector: "Commodity", held: false },
  WTI: { yahoo: "CL=F", name: "WTI Crude", sector: "Commodity", held: false },
  SPX: { yahoo: "^GSPC", name: "S&P 500", sector: "Index", held: false },
  VIX: { yahoo: "^VIX", name: "VIX", sector: "Volatility", held: false },
  GBPUSD: { yahoo: "GBPUSD=X", name: "GBP/USD", sector: "FX", held: false },
  // === SCANNER UNIVERSE (not held, not pipeline — screened for opportunities) ===
  MPC: { yahoo: "MPC", name: "Marathon Petroleum", sector: "Energy", held: false },
  CVX: { yahoo: "CVX", name: "Chevron", sector: "Energy", held: false },
  XOM: { yahoo: "XOM", name: "ExxonMobil", sector: "Energy", held: false },
  LMT: { yahoo: "LMT", name: "Lockheed Martin", sector: "Defence", held: false },
  RTX: { yahoo: "RTX", name: "Raytheon", sector: "Defence", held: false },
  GD: { yahoo: "GD", name: "General Dynamics", sector: "Defence", held: false },
  SLB: { yahoo: "SLB", name: "Schlumberger", sector: "Energy Services", held: false },
  HAL: { yahoo: "HAL", name: "Halliburton", sector: "Energy Services", held: false },
  DAL: { yahoo: "DAL", name: "Delta Air Lines", sector: "Airlines", held: false },
  UAL: { yahoo: "UAL", name: "United Airlines", sector: "Airlines", held: false },
  IAG: { yahoo: "IAG.L", name: "IAG", sector: "Airlines", held: false },
  GLNG: { yahoo: "GLNG", name: "Golar LNG", sector: "LNG", held: false },
  LNG: { yahoo: "LNG", name: "Cheniere Energy", sector: "LNG", held: false },
  APD: { yahoo: "APD", name: "Air Products", sector: "Industrial Gas", held: false },
  EQT: { yahoo: "EQT", name: "EQT Corporation", sector: "Natural Gas", held: false },
  AVGO: { yahoo: "AVGO", name: "Broadcom", sector: "Technology", held: false },
  GDX: { yahoo: "GDX", name: "Gold Miners ETF", sector: "Metals", held: false },
  XLU: { yahoo: "XLU", name: "Utilities ETF", sector: "Utilities", held: false },
  VNQ: { yahoo: "VNQ", name: "Real Estate ETF", sector: "REITs", held: false },
};

// Pence-denominated symbols (divide by 100)
export const PENCE_SYMBOLS = ["IAG.L", "BAE.L"];

// V5.0: Advisory only — scanner uses live Yahoo quoteSummary for real earnings dates.
// Status flipped to "passed" for dates before today's date.
export const EARNINGS_CALENDAR = [
  { ticker: "JPM", date: "2026-04-15", consensus_eps: 5.41, status: "passed" },
  { ticker: "BAC", date: "2026-04-15", consensus_eps: 1.00, status: "passed" },
  { ticker: "MS",  date: "2026-04-16", consensus_eps: 2.20, status: "passed" },
  { ticker: "CVX", date: "2026-04-24", consensus_eps: null, status: "upcoming" },
  { ticker: "APD", date: "2026-04-29", consensus_eps: null, status: "upcoming" },
  { ticker: "NVDA", date: "2026-05-28", consensus_eps: null, status: "watching" },
];

export const ALGO_THRESHOLDS = {
  stop_proximity_warn: 5,   // % — warn when price is within 5% of stop
  stop_proximity_critical: 3, // % — critical alert
  t1_proximity: 3,          // % — notify when within 3% of T1
  volume_breakout: 1.5,     // x — 1.5x 20-day average = breakout volume
  max_single_theme: 40,     // % NAV — R7 limit
  daily_loss_cap: 1,        // % NAV — R2
  monthly_loss_suspend: 10, // % — R3
  annual_drawdown_reduce: 20, // % — R4
  min_rr: 3,                // R6 minimum
  turkey_days: 10,          // R11 — days before mandatory bear case
};

// Dynamic ticker list — returns Yahoo symbols for ALL held positions
export function getHeldTickers(positions = []) {
  const held = new Set();
  for (const p of positions) {
    const w = WATCHLIST[p.id];
    if (w) held.add(w.yahoo);
    else held.add(p.id); // fallback to ticker ID if not in watchlist
  }
  // Always include macro
  held.add("BZ=F"); held.add("CL=F"); held.add("^GSPC"); held.add("^VIX"); held.add("GBPUSD=X");
  return [...held];
}
