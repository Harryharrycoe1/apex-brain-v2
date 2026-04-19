// APEX BRAIN V5.2 — CORTEX (Layer 3)
// DYNAMIC sections — reads live state instead of hardcoded stale facts.
//
// V5.2 ADDS: rule_status section — surfaces current Operating Bible rule state
//   (drawdown, monthly P&L, position count, halt status) so Claude sees real
//   fund-level risk, not just stale assumptions.
//
// V5.0 FIX: Previous version hardcoded "Peace Signal 1/8 COLLAPSED",
// "blockade active since 13 April 2026", and pipeline slot assignments.
// These strings were injected into Claude's context on every weekly_review /
// deep_analysis / investor_update call, causing Claude to reference 5+ day
// stale narratives with confidence. When reality diverged from the hardcoded
// strings, Claude still asserted the hardcoded version.
//
// New approach: SECTIONS is now a function of (state, regime, peaceSignal).
// Static sections (masters, psychology, tail_risk, technical) stay as constants
// because they encode TIMELESS principles. Dynamic sections (regime, conflict,
// earnings, pipeline, reflexivity) are built from live data.

// ═══ STATIC SECTIONS — timeless principles, safe to hardcode ═══
const STATIC_SECTIONS = {
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

  technical: `TECHNICAL PROTOCOL (Murphy/Grimes/Darvas):
Tools that work: Support/resistance, 50/200 DMA, volume confirmation, false breakouts, measured moves, higher timeframe dominance.
Darvas Box: Buy breakout above recent high with volume. Stop below box. Do not chase 3+ days later.
Intermarket: Brent rises → inflation up → bonds sell → yields rise → energy outperforms. USD strengthens → commodities fall.
Volume Rule: Breakout on low volume is suspect. Rising on rising volume = confirmation.`,
};

// ═══ DYNAMIC SECTION BUILDERS ═══

function buildRegimeSection(regime) {
  if (!regime?.current) {
    return `MACRO REGIME FRAMEWORK (Dalio):
Regime: UNKNOWN — regime detection unavailable. Defer structural views until regime can be confirmed.
Sleeve B (macro themes) is typically the default primary sleeve. Override only with confirmed regime.`;
  }
  const code = regime.current.primary_code || regime.current.primary_regime || "UNKNOWN";
  const conf = regime.current.confidence != null ? `${regime.current.confidence}%` : "n/a";
  const secondary = regime.current.secondary_regime;
  const isTransitioning = regime.current.is_transitioning;
  const shift = regime.shift?.shift_detected ? `\n⚠️ REGIME SHIFT DETECTED: ${regime.shift.from} → ${regime.shift.to}` : "";

  const regimePlaybook = {
    REFLATION: "Winners: Energy, Banks, Materials, Industrials. Losers: Long bonds, Utilities. Sleeve B is correct.",
    GOLDILOCKS: "Winners: Tech, Semis, Airlines, Consumer Discretionary. Losers: Gold, Energy. Sleeve A (tactical longs) + Sleeve C (quality tech).",
    STAGFLATION: "Winners: Gold, Commodities, Defence, Staples. Losers: Banks, Airlines, Growth. Sleeve C (defensive) + Sleeve A (hedges).",
    DEFLATION: "Winners: Long bonds, Utilities, Staples, Healthcare. Losers: Banks, Cyclicals, Energy. Sleeve C (quality defensives) + rotate out of Sleeve B.",
  };
  const playbook = regimePlaybook[code] || "Regime playbook not defined — defer to Dalio 4-quadrant logic.";

  const macroSnapshot = regime.current.macro_snapshot;
  const snapshot = macroSnapshot
    ? `\nSnapshot: VIX ${macroSnapshot.vix?.toFixed(1) || "n/a"} | Brent $${macroSnapshot.brent?.toFixed(1) || "n/a"} | 10Y ${macroSnapshot.yield_10y?.toFixed(2) || "n/a"}%`
    : "";

  return `MACRO REGIME FRAMEWORK (Dalio):
Current: ${code} (${conf} confidence)${isTransitioning && secondary ? ` — TRANSITIONING, secondary: ${secondary}` : ""}${shift}${snapshot}
${playbook}
Transition signals: Watch for regime shift via VIX spike, Brent break, yield curve inversion, credit spreads widening.`;
}

function buildConflictSection(peaceSignal, state) {
  const conflictDay = Math.floor((Date.now() - new Date("2026-02-28").getTime()) / 86400000);

  if (!peaceSignal) {
    return `CONFLICT INTELLIGENCE — Day ${conflictDay}:
Peace signal: UNAVAILABLE (altData monitor offline). Do not assume any specific state — web-search for current conflict status.
Portfolio stance: Hold existing positions. Do not recommend new energy/defence entries until peace signal is back online.`;
  }

  const score = peaceSignal.score ?? 0;
  const action = peaceSignal.action || (score >= 3 ? "EXIT SEQUENCE ARMED — reduce energy exposure" : "Monitor — below trigger");
  const components = peaceSignal.components || {};
  const compLines = Object.entries(components)
    .map(([k, v]) => `  ${k}: ${typeof v === "object" ? (v.score ?? v.status ?? JSON.stringify(v)) : v}`)
    .join("\n");

  const interpretation =
    score >= 5 ? "HIGH: Peace deal likely imminent. Execute exit sequence NOW. Rotate to airlines/SPX long." :
    score >= 3 ? "ELEVATED: Exit sequence armed per Operating Bible. Reduce energy 50%. Prepare Brent short flip." :
    score >= 1.5 ? "WATCHING: Backchannel activity confirmed but incomplete. Tighten stops on energy. Do not add." :
    "LOW: Conflict dynamics dominant. Energy positions reflect base case.";

  return `CONFLICT INTELLIGENCE — Day ${conflictDay}:
Peace Signal Score: ${score}/8 — ${action}
Components:
${compLines || "  (component breakdown unavailable)"}
Interpretation: ${interpretation}
Portfolio posture: Reference LIVE FUND STATE below for current energy/rate exposure.`;
}

function buildReflexivitySection(regime, peaceSignal) {
  const score = peaceSignal?.score ?? null;
  const code = regime?.current?.primary_code || "UNKNOWN";

  let loopPhase = "UNKNOWN";
  let trigger = "Unknown — assess based on current positioning";

  if (code === "REFLATION" && score !== null && score < 2) {
    loopPhase = "CONFIRMATION — oil/rate shock driving bank NIM expansion and commodity demand. Institutional buyers entering.";
    trigger = "Peace deal OR inflation rollover would break the loop. Watch peace signal score rising above 3.";
  } else if (code === "REFLATION" && score >= 3) {
    loopPhase = "REVERSAL IMMINENT — peace signal triggered. Energy reflexive unwind likely. Rotation window.";
    trigger = "Already triggered. Execute exit sequence.";
  } else if (code === "GOLDILOCKS") {
    loopPhase = "CONFIRMATION — growth + disinflation enabling multiple expansion. Tech/AI reflexivity active.";
    trigger = "Inflation re-acceleration or growth slowdown breaks the loop. Watch AAII sentiment, VIX, credit spreads.";
  } else if (code === "STAGFLATION") {
    loopPhase = "EARLY — growth slowing against sticky inflation. Gold reflexivity just beginning.";
    trigger = "Fed cuts aggressively OR demand collapse would end the regime.";
  } else if (code === "DEFLATION") {
    loopPhase = "CONFIRMATION — bond rally self-reinforcing as rate expectations drop.";
    trigger = "Fiscal stimulus, inflation shock, or central bank pivot breaks the loop.";
  }

  return `SOROS REFLEXIVITY MAP:
Current loop phase: ${loopPhase}
Reversal trigger: ${trigger}
Counter-thesis watch: Peace signal score is the single best reversal detector for energy theme. Watch for score >=3.
Mechanism: When thesis becomes consensus, price discounts MORE extreme outcome than reality. First sign of reversal = reduce 50% (R12).`;
}

function buildEarningsSection(state) {
  const catalysts = state?.catalysts || [];
  const upcoming = catalysts
    .filter(c => c.status !== "passed" && c.date)
    .map(c => ({ ...c, daysUntil: Math.ceil((new Date(c.date).getTime() - Date.now()) / 86400000) }))
    .filter(c => c.daysUntil >= -1 && c.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 8);

  const positions = state?.positions || [];
  const positionNotes = positions
    .filter(p => p.earnings_date)
    .map(p => {
      const d = Math.ceil((new Date(p.earnings_date).getTime() - Date.now()) / 86400000);
      return d >= -1 && d <= 14 ? `${p.id}: ${d}d (${p.earnings_date})` : null;
    })
    .filter(Boolean);

  const upcomingLines = upcoming.length
    ? upcoming.map(c => `  ${c.date} (${c.daysUntil >= 0 ? c.daysUntil + "d" : "PAST"}): ${c.position || c.ticker || "—"} — ${c.event || "earnings"}`).join("\n")
    : "  (no upcoming catalysts within 30 days in state)";

  return `EARNINGS CATALYST PLAYBOOK:
Pre-earnings (T-7 to T-1): Research consensus, identify positioning. Size for volatility.
Earnings day: Tighter intraday stops. Guidance > EPS beat/miss.
Post-earnings: Beat + raise → hold through T1. Beat + muted → partial at +10-15%. Miss → stop automatic.

UPCOMING (from live state):
${upcomingLines}${positionNotes.length ? "\n\nPOSITION EARNINGS WITHIN 14 DAYS:\n  " + positionNotes.join("\n  ") : ""}`;
}

function buildPipelineSection(state) {
  const pipeline = state?.pipeline || [];
  const activePipeline = state?.active_pipeline || [];

  const active = activePipeline.length
    ? activePipeline.slice(0, 6).map(ap => {
        const rr = ap.rr ? `R:R ${ap.rr}:1` : "";
        return `  ${ap.candidate} [${ap.direction || "buy"}] entry $${ap.entry_price} | stop $${ap.stop} | T1 $${ap.t1} | ${rr} | source: ${ap.source || "manual"}`;
      }).join("\n")
    : "  (no active pipeline — scanner has no promoted setups)";

  const watching = pipeline.length
    ? pipeline.filter(p => p.status !== "filled").slice(0, 4).map(p => `  Slot ${p.slot}: ${p.candidate} [${p.status}]`).join("\n")
    : "  (pipeline slots empty)";

  const openSlots = 10 - (state?.positions?.length || 0);

  return `PIPELINE MANAGEMENT:
Open position slots: ${openSlots}/10
Active pipeline (promoted, awaiting entry):
${active}

Watchlist pipeline:
${watching}

Deployment rule: Best Ideas Test (R9) — any new position must beat weakest current holding.`;
}

// ═══ ENTITY-AWARE SECTIONS ═══
// Entity-to-section mapping
const ENTITY_SECTIONS = {
  // Financials → regime, earnings
  JPM: ["regime", "earnings"], BAC: ["regime", "earnings"], MS: ["regime", "earnings"],
  GS: ["regime", "earnings"], WFC: ["regime", "earnings"], C: ["regime", "earnings"],
  // Materials/commodities → regime, reflexivity
  FCX: ["regime", "reflexivity"], COPX: ["regime", "reflexivity"],
  // Tech → regime
  NVDA: ["regime"], MSFT: ["regime"], SMCI: ["regime"], AVGO: ["regime"],
  AMD: ["regime"], TSM: ["regime"], META: ["regime"], GOOGL: ["regime"],
  // International → regime, tail_risk
  EWJ: ["regime", "tail_risk"], FXI: ["regime", "tail_risk"], EEM: ["regime", "tail_risk"],
  // Bonds → regime, tail_risk
  TLT: ["regime", "tail_risk"], IEF: ["regime", "tail_risk"], SHY: ["regime"],
  // Gold → reflexivity (safe-haven reflexive behaviour)
  GLD: ["reflexivity", "tail_risk"], SLV: ["reflexivity"], GDX: ["regime", "reflexivity"],
  // Energy + LNG → conflict, reflexivity, earnings
  BRENT: ["conflict", "reflexivity"], WTI: ["conflict", "reflexivity"],
  CVX: ["conflict", "reflexivity", "earnings"], XOM: ["conflict", "reflexivity", "earnings"],
  MPC: ["conflict", "reflexivity"], COP: ["conflict", "reflexivity"],
  OXY: ["conflict", "reflexivity"], EOG: ["conflict", "reflexivity"],
  LNG: ["conflict", "reflexivity", "earnings"], GLNG: ["conflict", "reflexivity"],
  // Airlines → conflict (jet fuel), earnings
  DAL: ["conflict", "earnings"], UAL: ["conflict", "earnings"],
  AAL: ["conflict", "earnings"], IAG: ["conflict", "earnings"],
  // Defence → conflict
  LMT: ["conflict"], RTX: ["conflict"], GD: ["conflict"], NOC: ["conflict"],
};

// Pathway-to-section mapping
const PATHWAY_SECTIONS = {
  weekly_review: ["regime", "reflexivity", "psychology", "pipeline", "conflict", "rule_status"],
  deep_analysis: ["masters", "regime", "reflexivity", "technical", "tail_risk", "rule_status"],
  investor_update: ["regime", "pipeline", "earnings", "conflict", "rule_status"],
};

// V5.2: Build rule_status section from live state
function buildRuleStatusSection(state) {
  if (!state) return "RULE STATUS: (state unavailable)";

  const nav = Number(state?.account?.nav) || 0;
  const hwm = Number(state?.account?.high_water_mark) || nav;
  const dd = hwm > 0 ? Math.max(0, ((hwm - nav) / hwm) * 100) : 0;

  const monthStart = Number(state?.account?.month_start_nav) || 0;
  const monthlyPct = monthStart > 0 ? ((nav - monthStart) / monthStart) * 100 : null;

  const posCount = (state.positions || []).length;
  const realised = Number(state?.account?.total_realised_pl) || 0;

  let riskLevel = "NORMAL";
  const flags = [];

  if (dd >= 20) { riskLevel = "HALT"; flags.push(`R4 HALT: ${dd.toFixed(2)}% drawdown — new positions BLOCKED`); }
  else if (dd >= 15) { riskLevel = "ELEVATED"; flags.push(`R4 WARNING: ${dd.toFixed(2)}% drawdown, approaching 20% halt`); }

  if (monthlyPct !== null && monthlyPct < -10) {
    if (riskLevel === "NORMAL") riskLevel = "ELEVATED";
    flags.push(`R3: Monthly P&L ${monthlyPct.toFixed(2)}% — new positions should be suspended until month rolls`);
  }

  if (posCount >= 10) { flags.push(`POSITION CAP: ${posCount}/10 — no new positions allowed`); }
  else if (posCount >= 8) { flags.push(`Position count: ${posCount}/10 — approaching cap`); }

  const lines = [`RULE STATUS: ${riskLevel}`];
  lines.push(`NAV £${nav.toFixed(2)} | HWM £${hwm.toFixed(2)} | Drawdown ${dd.toFixed(2)}%`);
  if (monthlyPct !== null) lines.push(`Monthly P&L: ${monthlyPct >= 0 ? "+" : ""}${monthlyPct.toFixed(2)}% (from £${monthStart.toFixed(2)} month start)`);
  lines.push(`Positions: ${posCount}/10 | Realised P&L all-time: ${realised >= 0 ? "+" : ""}£${realised.toFixed(2)}`);
  if (flags.length > 0) {
    lines.push(`FLAGS:`);
    flags.forEach(f => lines.push(`  - ${f}`));
  } else {
    lines.push(`No rule flags. Fund operating within all Operating Bible thresholds.`);
  }
  return lines.join("\n");
}

export function getCortexSections(pathway, entities = [], contextNotes = "", state = null, regime = null, peaceSignal = null) {
  const needed = new Set(PATHWAY_SECTIONS[pathway] || []);
  for (const e of entities) {
    const es = ENTITY_SECTIONS[e.toUpperCase()];
    if (es) es.forEach(s => needed.add(s));
  }
  // Context-based loading
  const cn = (contextNotes || "").toLowerCase();
  if (cn.includes("conflict") || cn.includes("war") || cn.includes("iran") || cn.includes("blockade") || cn.includes("hormuz")) needed.add("conflict");
  if (cn.includes("psychology") || cn.includes("bias") || cn.includes("emotion")) needed.add("psychology");
  if (cn.includes("tail") || cn.includes("black swan")) needed.add("tail_risk");
  if (cn.includes("earning")) needed.add("earnings");
  if (cn.includes("regime") || cn.includes("macro")) needed.add("regime");
  if (cn.includes("reflexiv") || cn.includes("soros") || cn.includes("loop")) needed.add("reflexivity");
  if (cn.includes("pipeline") || cn.includes("slot") || cn.includes("candidate")) needed.add("pipeline");
  if (cn.includes("drawdown") || cn.includes("rule") || cn.includes("halt") || cn.includes("risk")) needed.add("rule_status");

  // V5.2: ALWAYS include rule_status for fund-level pathways so Claude knows
  // if the fund is in HALT mode before giving any trade advice
  if (pathway && ["weekly_review", "deep_analysis", "investor_update"].includes(pathway)) {
    needed.add("rule_status");
  }

  const output = [];
  for (const key of needed) {
    if (STATIC_SECTIONS[key]) { output.push(STATIC_SECTIONS[key]); continue; }
    if (key === "regime") { output.push(buildRegimeSection(regime)); continue; }
    if (key === "conflict") { output.push(buildConflictSection(peaceSignal, state)); continue; }
    if (key === "reflexivity") { output.push(buildReflexivitySection(regime, peaceSignal)); continue; }
    if (key === "earnings") { output.push(buildEarningsSection(state)); continue; }
    if (key === "pipeline") { output.push(buildPipelineSection(state)); continue; }
    if (key === "rule_status") { output.push(buildRuleStatusSection(state)); continue; }
  }
  return output;
}

// Backwards compat — old signature still works but loses dynamic features
export function getCortexSectionsLegacy(pathway, entities = [], contextNotes = "") {
  return getCortexSections(pathway, entities, contextNotes, null, null, null);
}
