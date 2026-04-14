// APEX BRAIN V2 — CORTEX (Layer 3)
// Deep knowledge sections loaded SELECTIVELY based on pathway + entities.
// Only loaded for: weekly_review, deep_analysis, investor_update

const SECTIONS = {
  masters: `MASTERS SYNTHESIS:
Druckenmiller: Concentrate when conviction is highest. Position size is the primary alpha driver.
PTJ: Play great defense. 5:1 R:R minimum. Monthly 10% loss rule. Never average down.
Soros: Reflexivity — markets create self-reinforcing loops. Find the loop before consensus. Size up dramatically when confirmed.
Dalio: Risk parity. 4 macro regimes. 15 uncorrelated return streams is the Holy Grail.
Burry: Deep value contrarian. Willing to be early and wrong before right. Structure trades with limited downside.
Livermore: Never argue with the tape. Pyramid into winners. There is time to go long, short, and fishing.
Ackman: Concentrated portfolio = every position a genuine best idea. Know who the forced buyers/sellers are.
Renaissance: Edge doesn't need to be large — it needs to be consistent. Correlation kills.`,

  psychology: `PSYCHOLOGY PROTOCOLS (Douglas/Kahneman):
Five Truths: Anything can happen. You don't need to know what's next. Random distribution of wins/losses. Edge = higher probability. Every moment is unique.
Three Fears: Being wrong (moving stops), losing money (closing winners early), missing out (chasing entries).
Cognitive Biases: Anchoring, loss aversion, availability heuristic, confirmation bias, overconfidence, planning fallacy, narrative fallacy, hindsight bias, sunk cost.
Devil's Advocate: 6 questions before every Sleeve B/C entry.
Carefree State: Pre-define every decision. When nothing is left to decide, emotion has nothing to attach to.`,

  tail_risk: `TAIL RISK (Taleb):
Turkey Problem: The longer a thesis works, the MORE alert you must be to reversal.
Extremistan: Financial markets have fat tails. Normal distribution severely underestimates tail probabilities.
Barbell: 85-90% safe + 10-15% speculative. The middle is the worst place.
LTCM Lessons: Correlation goes to 1 in crisis. Size prevented exit. Leverage amplifies. Model risk underestimated. Hubris closes feedback loop.
Gap Risk: In a peace deal overnight, Brent could gap $20 before stops execute. Model this.`,

  reflexivity: `SOROS REFLEXIVITY MAP:
Current thesis loop: Oil shock → inflation → rate sensitivity → banking profits + copper demand
Reflexivity phase: CONFIRMATION — institutional buyers entering. Not yet crowded.
Reversal trigger: Peace deal → belief breaks → reflexive unwind (faster than the way up).
Counter-thesis: Peace deal probability currently LOW (1/8 signals) but could change rapidly.`,

  technical: `TECHNICAL PROTOCOL (Murphy/Grimes/Darvas):
Tools that work: Support/resistance, 50/200 DMA, volume confirmation, false breakouts, measured moves, higher timeframe dominance.
Darvas Box: Buy breakout above recent high with volume. Stop below box. Do not chase 3+ days later.
Intermarket: Brent rises → inflation up → bonds sell → yields rise → energy outperforms. USD strengthens → commodities fall.
Volume Rule: Breakout on low volume is suspect. Rising on rising volume = confirmation.`,

  regime: `MACRO REGIME FRAMEWORK (Dalio):
Current: Rising Growth + Rising Inflation (MEDIUM confidence)
Winners: Banks (JPM, BAC, MS), materials (FCX, COPX), energy (if oil stays elevated)
Transition signals: If growth stalls → Stagflation (Sleeve C: quality growth). If inflation falls → Goldilocks (add high-beta growth).
Sleeve B is correct primary sleeve for current regime.
Japan (EWJ) benefits from global growth + weak yen. TLT hedges against regime shift to deflation.`,

  conflict: `CONFLICT INTELLIGENCE — Day ${Math.floor((Date.now() - new Date("2026-02-28").getTime()) / 86400000)}:
Status: US naval blockade of Iranian ports active since 13 April 2026.
Peace talks collapsed (Pakistan-hosted). IRGC threatening military response.
Oil: Brent ~$102 (+7% on blockade news). War premium returning.
Peace Signal Score: 1/8 (COLLAPSED). All signals at 0.
Key risk: Military confrontation at Hormuz could spike oil to $120+.
Key opportunity: If blockade succeeds without shooting, oil could stabilize $95-105 range.
Portfolio impact: Current positions (JPM, BAC, FCX) benefit from rising rates + growth. Oil spike helps FCX (copper correlates with commodity complex). Banks neutral to oil unless recession fears emerge.`,

  earnings: `EARNINGS CATALYST PLAYBOOK:
Pre-earnings (T-7 to T-1): Research consensus, identify positioning. Size for volatility.
Earnings day: Set tighter intraday stops. Watch guidance more than EPS beat/miss.
Post-earnings: If beat + guidance raise → hold through T1. If beat + muted guidance → take partial at +10-15%. If miss → stop loss automatic.
UPCOMING: BAC Apr 15 ($1.00 EPS consensus), CVX Apr 24, APD Apr 29.`,

  pipeline: `PIPELINE MANAGEMENT:
7 slots queued for deployment this week:
Slot 4: NVDA — AI backbone, Rubin GPU catalyst (Tuesday)
Slot 5: MSFT — Enterprise resilience (Tuesday)
Slot 6: MS — Trading revenue in volatile markets (Tuesday)
Slot 7: SMCI — AI infrastructure at accessible price (Wednesday)
Slot 8: COPX — Diversified copper ETF (Wednesday)
Slot 9: EWJ — Japan value play (Thu/Fri)
Slot 10: TLT — Bond hedge, uncorrelated (Thu/Fri)
Deployment pace: 60% NAV Monday → 80% Tuesday → 95% Wednesday → 100% Thu/Fri`,
};

// Entity-to-section mapping
const ENTITY_SECTIONS = {
  JPM: ["regime", "earnings"], BAC: ["regime", "earnings"], MS: ["regime"],
  FCX: ["regime"], COPX: ["regime"], NVDA: ["regime"], MSFT: ["regime"],
  SMCI: ["regime"], EWJ: ["regime"], TLT: ["regime", "tail_risk"],
  BRENT: ["conflict", "reflexivity"], CVX: ["conflict"], MPC: ["conflict"],
};

// Pathway-to-section mapping
const PATHWAY_SECTIONS = {
  weekly_review: ["regime", "reflexivity", "psychology", "pipeline"],
  deep_analysis: ["masters", "regime", "reflexivity", "technical", "tail_risk"],
  investor_update: ["regime", "pipeline", "earnings"],
};

export function getCortexSections(pathway, entities = [], contextNotes = "") {
  const needed = new Set(PATHWAY_SECTIONS[pathway] || []);
  for (const e of entities) {
    const es = ENTITY_SECTIONS[e.toUpperCase()];
    if (es) es.forEach(s => needed.add(s));
  }
  // Context-based loading
  const cn = (contextNotes || "").toLowerCase();
  if (cn.includes("conflict") || cn.includes("war") || cn.includes("iran") || cn.includes("blockade")) needed.add("conflict");
  if (cn.includes("psychology") || cn.includes("bias") || cn.includes("emotion")) needed.add("psychology");
  if (cn.includes("tail") || cn.includes("black swan") || cn.includes("risk")) needed.add("tail_risk");
  if (cn.includes("earning")) needed.add("earnings");

  return [...needed].filter(k => SECTIONS[k]).map(k => SECTIONS[k]);
}
