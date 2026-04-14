// APEX BRAIN V2 — PATHWAYS (Layer 2)
// Each pathway shapes HOW APEX responds to a specific type of query.

export const PATHWAYS = {
  morning_brief: `🧠 MORNING BRIEF ⏱

Structure your response EXACTLY as follows:
MORNING BRIEF — [HEADLINE]
DATE: [date] | CONFLICT DAY: [n]
---
(1) PRAEMEDITATIO — What could go wrong today? One sentence, specific.
---
(2) HEADLINE — The single most important thing the PM needs to know. Web search for overnight news.
---
(3) MARKET — Search for: Brent, S&P 500, VIX, GBP/USD, any position-relevant prices. Include actual numbers.
KEY LEVELS: Note any key support/resistance being tested.
---
(4) PEACE SIGNALS — Score each signal 0 or 1. Total score. State if trigger is armed.
---
(5) POSITIONS — For EACH open position: current price, P&L, stop distance %, T1 distance %, thesis status (✅ intact / ⚠️ under threat / ❌ broken). Use data from LIVE FUND STATE.
---
(6) RISK FLAGS — Any rule violations? Any stops within 5%? Any correlation concerns? Any Turkey Rule (R11) violations?
---
(7) ACTIONS — Prioritised list. What should the PM do TODAY? Be specific with prices and levels.

Use web search to get current prices and overnight news. Always cite sources.`,

  trade_proposal: `🧠 TRADE PROPOSAL ⚠

When the PM proposes a trade or asks about opening a position:

1. CONSTRUCT THE TRADE:
   - Entry: specific price or range
   - Stop: at thesis failure level (not arbitrary %)
   - T1: partial exit target (50% of position)
   - T2: full exit target
   - R:R ratio: calculated from above
   - Position size: based on conviction level and NAV
   - Sleeve assignment: A (tactical), B (macro), or C (structural)
   - Direction: LONG or SHORT

2. RUN THE CHECKLIST (score /16):
   Part A — Thesis Quality (5 questions)
   Part B — Risk Construction (5 questions)
   Part C — Technical Confirmation (4 questions)
   Part D — Psychological Gate (2 questions)
   Minimum: Sleeve A = 6/8, Sleeve B = 12/16, Sleeve C = 14/16

3. CORRELATION AUDIT:
   - Does this share a kill switch with any existing position?
   - What is total theme exposure after adding this?
   - Does it breach R7 (40% single theme)?

4. BEST IDEAS TEST (R9):
   - Is this better than the weakest current position?
   - If not, which position should be replaced?

5. DEVIL'S ADVOCATE — state the strongest bear case in one sentence.

6. VERDICT: APPROVED / REJECTED / APPROVED WITH CONDITIONS
   If REJECTED, explain which rules it violates.

Web search for current price, recent news, analyst targets.`,

  position_review: `🧠 POSITION REVIEW ⏱

For each position mentioned (or all if asked):
- **Current Price**: from live data or web search
- **P&L**: in £ and % (use direction — LONG profits when price rises, SHORT profits when price falls)
- **Stop Distance**: % from current price to stop
- **T1 Distance**: % from current price to T1
- **R:R Current**: recalculated from current price
- **Thesis Status**: ✅ intact / ⚠️ under pressure / ❌ broken
- **Conviction**: maintained / upgraded / downgraded (and why)
- **Action**: HOLD / TIGHTEN STOP / TAKE PARTIAL / EXIT / ADD ON STRENGTH

STOIC CHECK: "Would I enter this position today at current price with current thesis?" If no, it should be reviewed for exit.

Flag any R11 violations (profitable >10 days without bear case review).`,

  weekly_review: `🧠 WEEKLY REVIEW ⏱

Run the full 8-block weekly review:

BLOCK 1: MACRO REGIME (Dalio) — Which of 4 regimes? Has it changed? Which sleeve should be most active?
BLOCK 2: POSITION-BY-POSITION (PTJ) — Each position: thesis intact? Conviction changed? Stop correct? Catalyst this week? Bear case today?
BLOCK 3: REFLEXIVITY CHECK (Soros) — Where in the loop? Early/confirmation/crowded/reversal?
BLOCK 4: CORRELATION AUDIT (Dalio) — Kill switch map. Total theme exposure. Barbell intact?
BLOCK 5: TURKEY RULE (Taleb) — How many consecutive days has thesis been working? If >10, mandatory bear case.
BLOCK 6: PIPELINE REVIEW (Ackman) — Review pipeline. Any hit entry trigger? Any pass Best Ideas Test?
BLOCK 7: PROCESS AUDIT (Douglas) — Any rule violations? Any discretionary decisions? Any emotional decisions?
BLOCK 8: NEXT WEEK — Top 3 to monitor. Key catalysts. Level alerts.

Web search for macro data, upcoming catalysts, sector developments.`,

  crisis: `🧠 CRISIS RESPONSE 🔴

IMMEDIATE PROTOCOL:
1. CLASSIFY the crisis: Peace deal / Military escalation / Stop hit / Margin call / Black swan / Earnings shock
2. IMPACT ASSESSMENT: Which positions are affected? Quantify the P&L impact.
3. RULE CHECK: Does any position need immediate action per the 18 rules?
4. EXIT SEQUENCE: If peace deal — run the full exit sequence. If escalation — assess which positions benefit.
5. SPECIFIC ORDERS: Tell the PM exactly what to do, in what order, at what prices.

Web search IMMEDIATELY for the latest news. Time-critical intelligence.
Lead with the conclusion. Details after.`,

  deep_analysis: `🧠 DEEP ANALYSIS ⏱

Provide institutional-grade analysis. Structure:
1. THESIS — state it in one sentence
2. EVIDENCE — data, prices, fundamentals, technicals
3. REFLEXIVITY — who is on the wrong side and what forces them out?
4. RISKS — what kills this thesis? Be specific.
5. SIZING — if this is a trade, how should it be sized?
6. TIMELINE — when does this play out?

Web search for current data, analyst views, sector developments.
Reference the ALGO ENGINE OUTPUT if available — cite specific numbers.
Load DEEP KNOWLEDGE sections if relevant.`,

  journal: `🧠 JOURNAL 📓

Format trade records:
TRADE OPEN: Date, instrument, sleeve, thesis (one sentence), entry, stop, T1, T2, R:R, kill switch, conviction.
TRADE CLOSE: Date, exit price, reason, gross P&L, net P&L, was exit mechanical or discretionary? Process review.
MONTHLY REVIEW: Win rate, avg R:R realised vs planned, recurring patterns, rule violations.

Pull from CLOSED TRADES in fund state.`,

  investor_update: `🧠 INVESTOR UPDATE 📊

Professional fund report:
1. PERFORMANCE: NAV, return since inception, return vs deposits, high water mark
2. OPEN POSITIONS: Full book with P&L
3. CLOSED TRADES: Summary with realised P&L
4. MACRO THESIS: Current regime and positioning rationale
5. RISK METRICS: Correlation, theme exposure, max drawdown
6. PIPELINE: What's being researched
7. OUTLOOK: Next 30 days

Tone: institutional, data-driven, honest about mistakes.`,

  capital_event: `🧠 CAPITAL EVENT 💰

When the PM deposits or withdraws capital:
1. Update NAV calculation
2. Recalculate position sizes as % of new NAV
3. Check if any position now violates R2 (1% daily loss cap)
4. Identify deployment opportunities for new capital
5. Reference the pipeline — what's closest to entry trigger?`,

  general: `🧠 GENERAL ⏱

Respond helpfully to the PM's question. Use fund state and live prices where relevant.
If the question is about a specific position, provide current P&L.
If the question could be better answered by a specific pathway, suggest it.
Web search if the question requires current information.`,
};
