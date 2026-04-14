// APEX BRAIN V2 — FUND STATE
// LAST VERIFIED: 13 April 2026, 16:30 GMT (T212 screenshots)
// Conflict Day 45 | Peace Signal: 1/8 (COLLAPSED)
// Regime: Rising Growth + Rising Inflation
//
// ── DIRECTION ──
// direction: "buy" = LONG (profit when price rises)
// direction: "short" = SHORT (profit when price falls)

export const DEFAULT_STATE = {
  account: {
    nav: 884.54,
    cash: 886.42,
    margin_used: 14.24,
    margin_health_pct: 98,
    total_deposited: 835,
    total_realised_pl: 50.69,
    gbp_usd: 1.3438,
    high_water_mark: 908.30,
    inception_date: "2026-03-17",
    last_updated: "2026-04-13T16:30:00Z",
  },

  positions: [
    // ═══ PHASE 1 — LIVE ON T212 (13 April 2026) ═══
    {
      id: "JPM", name: "JPMorgan Chase", sleeve: "B", direction: "buy",
      units: 0.61, entry_price: 307.61, entry_date: "2026-04-13T14:30:00Z",
      currency: "USD",
      stop: 295.00, trailing_stop: null,
      t1: 340.00, t2: null,
      kill_switch: "Credit crisis / banking sector contagion",
      peace_action: "HOLD — banks benefit from any macro regime with growth",
      thesis: "Banking NIM expansion in 3.5-3.75% rate environment. Q1 earnings consensus $5.41 EPS, $48.2B revenue. IB fees up 28% YoY expected.",
      conviction: 4, notes: "Stop tightened from $285 to $295 (R:R 2.57:1→3.57:1)",
    },
    {
      id: "BAC", name: "Bank of America", sleeve: "B", direction: "buy",
      units: 3.11, entry_price: 52.10, entry_date: "2026-04-13T14:30:00Z",
      currency: "USD",
      stop: 46.00, trailing_stop: null,
      t1: 65.00, t2: null,
      kill_switch: "Earnings miss + guidance cut / credit deterioration",
      peace_action: "HOLD — rate sensitivity benefits in any growth environment",
      thesis: "Earnings April 15 (2 DAYS). Highest rate sensitivity among major banks. $1.00 EPS consensus. Steepening yield curve + loan growth.",
      conviction: 3, notes: "Wider stop (11.3%) justified for earnings volatility. Pre-positioned as catalyst play.",
    },
    {
      id: "FCX", name: "Freeport-McMoRan", sleeve: "B", direction: "buy",
      units: 2.63, entry_price: 67.66, entry_date: "2026-04-13T14:30:00Z",
      currency: "USD",
      stop: 62.00, trailing_stop: null,
      t1: 78.00, t2: null,
      kill_switch: "Copper demand destruction / China slowdown / mine supply surge",
      peace_action: "HOLD — copper deficit is structural, independent of conflict",
      thesis: "Structural copper deficit 150,000 metric tons in 2026. COMEX copper near ATH $5.65/lb. AI infrastructure + EVs + grid modernization driving inelastic demand. Mine supply growth only 1.4%.",
      conviction: 4, notes: "Stop tightened from $58 to $62 (R:R 1.07:1→1.83:1). Thesis strong but R:R needs monitoring.",
    },
  ],

  // ═══ PIPELINE — QUEUED FOR DEPLOYMENT THIS WEEK ═══
  pipeline: [
    { slot: 4, status: "armed", candidate: "NVDA", sleeve: "C", entry_target: 177.45, stop: 155, t1: 210, day: "Tuesday", thesis: "AI backbone — Rubin GPU H2 2026, $4.3T market cap, 5x perf over Blackwell" },
    { slot: 5, status: "armed", candidate: "MSFT", sleeve: "C", entry_target: 355.12, stop: 320, t1: 405, day: "Tuesday", thesis: "Enterprise software resilience, AI integration catalyst" },
    { slot: 6, status: "armed", candidate: "MS", sleeve: "B", entry_target: 132.19, stop: 120, t1: 155, day: "Tuesday", thesis: "Trading revenue + IB fees in volatile market" },
    { slot: 7, status: "armed", candidate: "SMCI", sleeve: "C", entry_target: 90, stop: 78, t1: 110, day: "Wednesday", thesis: "AI infrastructure, AVGO substitute at accessible price point" },
    { slot: 8, status: "armed", candidate: "COPX", sleeve: "B", entry_target: 62.15, stop: 55, t1: 72, day: "Wednesday", thesis: "Diversified copper exposure via ETF" },
    { slot: 9, status: "armed", candidate: "EWJ", sleeve: "B", entry_target: 74.52, stop: 67, t1: 85, day: "Thu/Fri", thesis: "Japan value — discount valuations, corporate reform, weak yen" },
    { slot: 10, status: "armed", candidate: "TLT", sleeve: "Independent", entry_target: 89.73, stop: 82, t1: 102, day: "Thu/Fri", thesis: "Bond hedge — uncorrelated to equity risk, rate cut hedge" },
  ],

  // ═══ CLOSED TRADES — FULL HISTORY ═══
  closed: [
    // Cycle 1: Original conflict thesis (Mar 17 - Apr 13)
    { id: "FRO-1", ticker: "FRO", name: "Frontline PLC", direction: "buy", entry_price: 32.24, exit_price: 32.60, units: 30.95, entry_date: "2026-03-18", exit_date: "2026-03-20", net_pl: 7.25, reason: "Thesis failure — ships at anchor not rerouting", exit_type: "manual" },
    { id: "LNG-1", ticker: "LNG", name: "Cheniere Energy", direction: "buy", entry_price: 273.98, exit_price: 278.50, units: 1.09, entry_date: "2026-03-19", exit_date: "2026-03-28", net_pl: 3.82, reason: "Partial rotation", exit_type: "manual" },
    { id: "CVX-1", ticker: "CVX", name: "Chevron (partial)", direction: "buy", entry_price: 197.25, exit_price: 205.00, units: 3.45, entry_date: "2026-03-17", exit_date: "2026-03-30", net_pl: 20.64, reason: "Partial profit taking", exit_type: "manual" },
    { id: "GLNG-1", ticker: "GLNG", name: "Golar LNG", direction: "buy", entry_price: 49.03, exit_price: 52.80, units: 0.875, entry_date: "2026-03-19", exit_date: "2026-04-02", net_pl: 2.45, reason: "Trailing stop hit", exit_type: "stop" },
    { id: "MPC-1", ticker: "MPC", name: "Marathon Petroleum", direction: "buy", entry_price: 238.47, exit_price: 244.00, units: 3.49, entry_date: "2026-03-18", exit_date: "2026-04-05", net_pl: 14.88, reason: "Thesis rotation to diversified portfolio", exit_type: "manual" },
    { id: "APD-1", ticker: "APD", name: "Air Products", direction: "buy", entry_price: 285.91, exit_price: 289.00, units: 3.00, entry_date: "2026-03-20", exit_date: "2026-04-06", net_pl: 6.90, reason: "Portfolio restructure", exit_type: "manual" },
    { id: "CVX-2", ticker: "CVX", name: "Chevron (stub)", direction: "buy", entry_price: 197.25, exit_price: 192.00, units: 0.50, entry_date: "2026-03-17", exit_date: "2026-04-08", net_pl: -1.93, reason: "Stop hit on oil weakness", exit_type: "stop" },
    { id: "IAG-1", ticker: "IAG", name: "IAG", direction: "buy", entry_price: 3.5584, exit_price: 3.7569, units: 5.5, entry_date: "2026-03-22", exit_date: "2026-04-13", net_pl: 1.14, reason: "Peace thesis collapsed — blockade commenced", exit_type: "manual" },
    { id: "DAL-1", ticker: "DAL", name: "Delta Air Lines", direction: "buy", entry_price: 65.40, exit_price: 66.54, units: 1.0, entry_date: "2026-03-22", exit_date: "2026-04-13", net_pl: 1.88, reason: "Peace thesis collapsed — oil shock accelerating", exit_type: "manual" },
  ],

  // ═══ SIGNALS — PEACE FRAMEWORK ═══
  signals: {
    s1_backchannel: 0, s1_weight: 2,
    s2_ais: 0, s2_weight: 1,
    s3_insurance: 0, s3_weight: 2,
    s4_trump_tone: 0, s4_weight: 1,
    s5_mediator: 0, s5_weight: 1,
    s6_brent_drop: 0, s6_weight: 1,
    total: 0, trigger: 3,
    last_updated: "2026-04-13",
    notes: "PEACE FRAMEWORK COLLAPSED. Pakistan talks failed. US blockade commenced 14:00 GMT. IRGC threatening military response. All signals at 0 except Brent (war premium returning).",
  },

  // ═══ CATALYSTS ═══
  catalysts: [
    { date: "2026-04-15", position: "BAC", event: "Q1 Earnings ($1.00 EPS consensus)", status: "upcoming" },
    { date: "2026-04-24", position: "CVX", event: "Q1 Earnings", status: "watching" },
    { date: "2026-04-29", position: "APD", event: "Q1 Earnings (helium repricing)", status: "watching" },
    { date: "2026-04-30", position: "LNG", event: "Q1 Earnings", status: "watching" },
  ],

  // ═══ DEPOSITS ═══
  deposits: [
    { date: "2026-03-17", amount: 500 },
    { date: "2026-03-24", amount: 200 },
    { date: "2026-04-01", amount: 135 },
  ],

  // ═══ MEMORY ═══
  memory: [],

  // ═══ PM PROFILE ═══
  pm_profile: {
    strengths: ["Mechanical exits", "Rule compliance", "Regime adaptation"],
    patterns_to_watch: [
      "Ticker entry errors (JMP vs JPM) — validate before committing",
      "Position sizing in USD vs GBP — always convert at live rate",
      "Peace thesis positions held too long through regime shift — exit faster on thesis collapse",
    ],
    biases_detected: [],
  },

  // ═══ BENCHMARKS ═══
  benchmarks: {
    spx_at_inception: 6568,
    brent_at_inception: 108,
    gbpusd_at_inception: 1.29,
  },
};
