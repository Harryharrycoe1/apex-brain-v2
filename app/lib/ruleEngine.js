// APEX BRAIN V5.2 — RULE ENGINE
//
// Central validator for Operating Bible rules. Returns structured violations
// that the caller decides to BLOCK, WARN+CONFIRM, or log.
//
// Rules enforced:
//   R1  Inviolable stop — every position must have a stop before entry
//   R2  1% daily loss cap — max loss per position <= 1% NAV
//   R3  10% monthly loss — new positions suspended if monthly P&L < -10%
//   R4  20% annual drawdown — reduce to 50% and halt new positions
//   R5  No adding to losers — block if position in loss
//   R6  3:1 minimum R:R — reward/risk must be >= 3:1
//   R7  Correlation — two positions same sector + direction + kill switch
//   R8  Let winners run — no full exit before T1 (advisory)
//   R9  Best Ideas Test — compare to weakest position
//   R10 Daily review — advisory
//
// Additionally:
//   10-position cap (Operating Bible Architecture section)
//   Stop on correct side of entry (LONG: stop<entry; SHORT: stop>entry)
//   Thesis and kill switch required on all positions (Book of Wisdom Rule 16)

// ═══ Severity levels ═══
export const SEVERITY = {
  BLOCK: "BLOCK",      // Cannot proceed without override
  WARN: "WARN",        // Warn + confirm, but can proceed
  INFO: "INFO",        // Informational only
};

// ═══ NAV calculation ═══
function getNav(state) {
  return Number(state?.account?.nav) || 0;
}

function getHwm(state) {
  return Number(state?.account?.high_water_mark) || getNav(state);
}

function getGbpUsd(state) {
  return Number(state?.account?.gbp_usd) || 1.34;
}

// ═══ Drawdown calculations ═══
export function computeDrawdown(state) {
  const nav = getNav(state);
  const hwm = getHwm(state);
  if (hwm <= 0) return 0;
  const dd = (hwm - nav) / hwm * 100;
  return Math.max(0, dd);
}

/**
 * Compute month-to-date P&L.
 * Reads state.account.monthly_pnl if set, else computes from strategy_log.
 * For V5.2 we require state.account.month_start_nav to be set when month rolls.
 */
export function computeMonthlyPL(state) {
  const monthStartNav = Number(state?.account?.month_start_nav);
  const nav = getNav(state);
  if (!monthStartNav || monthStartNav <= 0) return { pct: 0, pounds: 0, valid: false };
  const gbpMove = nav - monthStartNav;
  const pct = (gbpMove / monthStartNav) * 100;
  return { pct, pounds: gbpMove, valid: true };
}

// ═══ Per-position risk calculations ═══

/**
 * Max £ loss if stop hits, as % of NAV.
 */
export function maxLossPctNav(pos, state) {
  const nav = getNav(state);
  if (nav <= 0) return 0;
  const entry = Number(pos.entry_price);
  const stop = Number(pos.stop);
  const units = Number(pos.units);
  if (!entry || !stop || !units) return 0;
  const dir = (pos.direction || "buy").toLowerCase();
  const isLong = dir !== "short" && dir !== "sell";
  const perUnitLoss = isLong ? entry - stop : stop - entry;
  if (perUnitLoss <= 0) return 0; // stop on wrong side
  const currency = (pos.currency || "USD").toUpperCase();
  const fx = currency === "GBP" ? 1 : (1 / getGbpUsd(state));
  const gbpLoss = perUnitLoss * units * fx;
  return (gbpLoss / nav) * 100;
}

/**
 * R:R ratio: (T1 - entry) / (entry - stop) for long; inverted for short.
 */
export function computeRR(pos) {
  const entry = Number(pos.entry_price);
  const stop = Number(pos.stop);
  const t1 = Number(pos.t1);
  if (!entry || !stop || !t1) return null;
  const dir = (pos.direction || "buy").toLowerCase();
  const isLong = dir !== "short" && dir !== "sell";
  const risk = isLong ? entry - stop : stop - entry;
  const reward = isLong ? t1 - entry : entry - t1;
  if (risk <= 0 || reward <= 0) return 0;
  return reward / risk;
}

// ═══ Individual rule validators ═══

export function checkR1_HasStop(pos) {
  if (!pos.stop || !Number.isFinite(Number(pos.stop)) || Number(pos.stop) <= 0) {
    return { rule: "R1", severity: SEVERITY.BLOCK, message: "R1 VIOLATION: Stop loss must be set before entry. This is inviolable." };
  }
  return null;
}

export function checkStopSide(pos) {
  const entry = Number(pos.entry_price);
  const stop = Number(pos.stop);
  if (!entry || !stop) return null;
  const dir = (pos.direction || "buy").toLowerCase();
  const isLong = dir !== "short" && dir !== "sell";
  if (isLong && stop >= entry) {
    return { rule: "STOP_SIDE", severity: SEVERITY.BLOCK, message: `Stop ($${stop}) must be BELOW entry ($${entry}) for a LONG position.` };
  }
  if (!isLong && stop <= entry) {
    return { rule: "STOP_SIDE", severity: SEVERITY.BLOCK, message: `Stop ($${stop}) must be ABOVE entry ($${entry}) for a SHORT position.` };
  }
  return null;
}

export function checkR2_DailyLossCap(pos, state) {
  const lossPct = maxLossPctNav(pos, state);
  if (lossPct > 1.0) {
    return {
      rule: "R2", severity: SEVERITY.WARN,
      message: `R2 WARNING: Max loss on this position is ${lossPct.toFixed(2)}% of NAV (exceeds 1% daily cap). Reduce units or tighten stop.`,
      meta: { lossPct: lossPct.toFixed(2) },
    };
  }
  return null;
}

export function checkR3_MonthlyLoss(state) {
  const m = computeMonthlyPL(state);
  if (!m.valid) return null;
  if (m.pct < -10) {
    return {
      rule: "R3", severity: SEVERITY.WARN,
      message: `R3 WARNING: Fund is down ${m.pct.toFixed(2)}% this month. R3 says no new positions until month rolls.`,
      meta: { monthlyPct: m.pct.toFixed(2) },
    };
  }
  return null;
}

export function checkR4_Drawdown(state) {
  const dd = computeDrawdown(state);
  if (dd >= 20) {
    return {
      rule: "R4", severity: SEVERITY.BLOCK,
      message: `R4 HALT: Fund drawdown is ${dd.toFixed(2)}% from HWM. R4 requires halving positions and halting new entries. Review all positions.`,
      meta: { drawdownPct: dd.toFixed(2) },
    };
  }
  if (dd >= 15) {
    return {
      rule: "R4", severity: SEVERITY.WARN,
      message: `R4 WARNING: Drawdown at ${dd.toFixed(2)}%. Approaching 20% circuit breaker.`,
      meta: { drawdownPct: dd.toFixed(2) },
    };
  }
  return null;
}

export function checkR6_RiskReward(pos) {
  const rr = computeRR(pos);
  if (rr == null) {
    return { rule: "R6", severity: SEVERITY.WARN, message: "R6 WARNING: T1 not set, R:R cannot be computed. Set T1 before entry." };
  }
  if (rr < 3) {
    return {
      rule: "R6", severity: SEVERITY.WARN,
      message: `R6 WARNING: R:R is ${rr.toFixed(2)}:1 — below 3:1 minimum per Operating Bible.`,
      meta: { rr: rr.toFixed(2) },
    };
  }
  return null;
}

export function checkPositionCap(state) {
  const count = (state?.positions || []).length;
  if (count >= 10) {
    return {
      rule: "POSITION_CAP", severity: SEVERITY.BLOCK,
      message: `POSITION CAP: Already at 10/10 positions. Close one before opening another.`,
      meta: { currentCount: count },
    };
  }
  if (count >= 8) {
    return {
      rule: "POSITION_CAP", severity: SEVERITY.INFO,
      message: `Note: ${count}/10 positions open. Approaching cap.`,
      meta: { currentCount: count },
    };
  }
  return null;
}

export function checkThesis(pos) {
  if (!pos.thesis || String(pos.thesis).trim().length < 10) {
    return {
      rule: "THESIS_REQUIRED", severity: SEVERITY.WARN,
      message: "Thesis is required — write at least one sentence explaining why this trade works (Book of Wisdom Rule 16, Soros journal method).",
    };
  }
  return null;
}

export function checkKillSwitch(pos) {
  if (!pos.kill_switch || String(pos.kill_switch).trim().length < 5) {
    return {
      rule: "KILL_SWITCH_REQUIRED", severity: SEVERITY.WARN,
      message: "Kill switch required — state the single event that invalidates this thesis (Operating Bible, every position).",
    };
  }
  return null;
}

export function checkR5_NoAddToLoser(pos, state, livePrice) {
  // Only applies on update_position when units increase
  // This is called specifically when user is increasing size on existing position
  const existing = (state?.positions || []).find(p => p.id === pos.id);
  if (!existing) return null;
  const entry = Number(existing.entry_price);
  const current = Number(livePrice) || entry;
  const dir = (existing.direction || "buy").toLowerCase();
  const isLong = dir !== "short" && dir !== "sell";
  const inLoss = isLong ? current < entry : current > entry;
  if (inLoss) {
    return {
      rule: "R5", severity: SEVERITY.WARN,
      message: `R5 WARNING: Position is in loss (entry $${entry}, current $${current}). Rule 5 prohibits averaging down. The Big Short lesson: if thesis is right, market will give a re-entry.`,
      meta: { entry, current },
    };
  }
  return null;
}

export function checkR7_Correlation(pos, state) {
  const positions = state?.positions || [];
  if (positions.length === 0) return null;
  const newSector = pos.sector || "";
  const newDir = (pos.direction || "buy").toLowerCase();
  const newKill = (pos.kill_switch || "").toLowerCase();
  if (!newSector && !newKill) return null;
  for (const p of positions) {
    if (p.id === pos.id) continue;
    const pSector = p.sector || "";
    const pDir = (p.direction || "buy").toLowerCase();
    const pKill = (p.kill_switch || "").toLowerCase();
    const sectorMatch = newSector && pSector && newSector === pSector;
    const dirMatch = newDir === pDir;
    const killMatch = newKill && pKill && (newKill.includes(pKill) || pKill.includes(newKill));
    if (sectorMatch && dirMatch && killMatch) {
      return {
        rule: "R7", severity: SEVERITY.WARN,
        message: `R7 WARNING: Correlation detected. ${pos.id || "new"} shares sector "${pSector}", direction, and kill switch with ${p.id}. LTCM lesson: correlated positions become one position in a crisis.`,
        meta: { correlatedWith: p.id },
      };
    }
  }
  return null;
}

// ═══ Aggregate validators ═══

/**
 * Validate a NEW position proposal. Returns array of violations.
 * @param {Object} pos - proposed position
 * @param {Object} state - current fund state
 * @returns {Array} violations (empty = all pass)
 */
export function validateNewPosition(pos, state) {
  const violations = [];

  // Drawdown (fund-level; checked first because if halted, nothing else matters)
  const r4 = checkR4_Drawdown(state);
  if (r4) violations.push(r4);

  // Monthly loss
  const r3 = checkR3_MonthlyLoss(state);
  if (r3) violations.push(r3);

  // Position count
  const cap = checkPositionCap(state);
  if (cap) violations.push(cap);

  // Per-position rules
  const r1 = checkR1_HasStop(pos); if (r1) violations.push(r1);
  const side = checkStopSide(pos); if (side) violations.push(side);
  const r2 = checkR2_DailyLossCap(pos, state); if (r2) violations.push(r2);
  const r6 = checkR6_RiskReward(pos); if (r6) violations.push(r6);
  const thesis = checkThesis(pos); if (thesis) violations.push(thesis);
  const kill = checkKillSwitch(pos); if (kill) violations.push(kill);
  const r7 = checkR7_Correlation(pos, state); if (r7) violations.push(r7);

  return violations;
}

/**
 * Validate a MODIFICATION to existing position.
 */
export function validateUpdate(updates, existingPos, state, livePrice) {
  const violations = [];

  // Build projected position (existing + updates)
  const projected = { ...existingPos, ...updates };

  // R1 — can't remove stop
  if (updates.stop === null) {
    violations.push({ rule: "R1", severity: SEVERITY.BLOCK, message: "R1 VIOLATION: Cannot remove stop loss. Stops are inviolable." });
  }

  // Stop side check if stop is being changed
  if (updates.stop !== undefined) {
    const side = checkStopSide(projected);
    if (side) violations.push(side);
  }

  // R5 — adding to a loser
  if (updates.units !== undefined && Number(updates.units) > Number(existingPos.units)) {
    const r5 = checkR5_NoAddToLoser(projected, state, livePrice);
    if (r5) violations.push(r5);
  }

  return violations;
}

/**
 * Classify a list of violations into block vs warn.
 */
export function classify(violations) {
  const blockers = violations.filter(v => v.severity === SEVERITY.BLOCK);
  const warnings = violations.filter(v => v.severity === SEVERITY.WARN);
  const infos = violations.filter(v => v.severity === SEVERITY.INFO);
  return { blockers, warnings, infos, hasBlockers: blockers.length > 0, hasWarnings: warnings.length > 0 };
}

/**
 * Rule summary for /api/rules endpoint and UI banner.
 * Returns the current fund-level rule status.
 */
export function fundRuleStatus(state) {
  const dd = computeDrawdown(state);
  const monthly = computeMonthlyPL(state);
  const posCount = (state?.positions || []).length;
  const nav = getNav(state);
  const hwm = getHwm(state);

  let riskLevel = "NORMAL";
  let blockedActions = [];
  let warnings = [];

  if (dd >= 20) {
    riskLevel = "HALT";
    blockedActions.push("new_positions");
    warnings.push(`R4 HALT: ${dd.toFixed(2)}% drawdown. Positions should be halved.`);
  } else if (dd >= 15) {
    riskLevel = "ELEVATED";
    warnings.push(`Approaching R4: ${dd.toFixed(2)}% drawdown`);
  }

  if (monthly.valid && monthly.pct < -10) {
    if (riskLevel === "NORMAL") riskLevel = "ELEVATED";
    warnings.push(`R3: Monthly P&L ${monthly.pct.toFixed(2)}%`);
  }

  if (posCount >= 10) {
    blockedActions.push("new_positions");
    warnings.push(`POSITION CAP: ${posCount}/10`);
  }

  return {
    risk_level: riskLevel,
    nav,
    high_water_mark: hwm,
    drawdown_pct: dd,
    monthly_pl: monthly,
    position_count: posCount,
    position_cap: 10,
    blocked_actions: [...new Set(blockedActions)],
    warnings,
  };
}
