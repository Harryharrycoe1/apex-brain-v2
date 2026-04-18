// APEX BRAIN V5.1 — TRAILING STOP WORKER
//
// Called from /api/prices on every tick to update trailing stops on open positions.
// Never moves stops against the position (ratchet only).
//
// Position shape (trailing-stop relevant fields):
//   trailing_stop            — current computed stop price (the "hard" stop UI shows)
//   trailing_stop_pct        — trail distance as %, e.g. 5 means stop trails 5% below HWM
//   trailing_stop_hwm        — high-water-mark (for LONG) or low-water-mark (for SHORT)
//   trailing_stop_activated  — ISO timestamp when trailing activated
//
// Semantics:
//   - If trailing_stop_pct is set but trailing_stop_hwm is unset, initialize HWM to entry_price or current price.
//   - On every update: if LONG and price > HWM, advance HWM. Recompute stop. Stop never decreases for LONG.
//   - For SHORT: mirror logic (LWM never increases, stop never increases).
//   - Emits a flag when stop is advanced so caller can log / alert.

/**
 * Update one position's trailing stop based on live price.
 * @param {Object} pos - position object (mutated)
 * @param {number} livePrice - current price from prices feed
 * @returns {Object} { advanced, old_stop, new_stop, reason }
 */
export function updateTrailingStop(pos, livePrice) {
  if (!pos || typeof pos !== "object") return { advanced: false, reason: "no_position" };
  if (!Number.isFinite(livePrice) || livePrice <= 0) return { advanced: false, reason: "no_price" };

  const trailPct = Number(pos.trailing_stop_pct);
  if (!Number.isFinite(trailPct) || trailPct <= 0) {
    return { advanced: false, reason: "no_trail_pct" };
  }

  const dir = (pos.direction || "buy").toLowerCase();
  const isLong = dir !== "short" && dir !== "sell";
  const entry = Number(pos.entry_price);

  // Initialize HWM/LWM if not set
  if (pos.trailing_stop_hwm == null || !Number.isFinite(Number(pos.trailing_stop_hwm))) {
    // Start HWM at the better of entry or current price (only "in profit" positions should trail)
    pos.trailing_stop_hwm = isLong
      ? Math.max(entry || livePrice, livePrice)
      : Math.min(entry || livePrice, livePrice);
    pos.trailing_stop_activated = new Date().toISOString();
  }

  const hwm = Number(pos.trailing_stop_hwm);
  let newHwm = hwm;
  let hwmAdvanced = false;

  if (isLong) {
    // Long: advance HWM up if price made new high
    if (livePrice > hwm) {
      newHwm = livePrice;
      hwmAdvanced = true;
    }
  } else {
    // Short: advance LWM down if price made new low
    if (livePrice < hwm) {
      newHwm = livePrice;
      hwmAdvanced = true;
    }
  }

  // Compute new trailing stop from HWM
  const computedStop = isLong
    ? newHwm * (1 - trailPct / 100)
    : newHwm * (1 + trailPct / 100);

  const oldStop = Number(pos.trailing_stop) || 0;

  // Ratchet: never move stop against the position
  let newStop;
  if (oldStop === 0) {
    // First time — set it
    newStop = computedStop;
  } else if (isLong) {
    newStop = Math.max(oldStop, computedStop); // Long stop only moves UP
  } else {
    newStop = Math.min(oldStop, computedStop); // Short stop only moves DOWN
  }

  const advanced = newStop !== oldStop;
  const hwmChanged = hwmAdvanced;

  if (advanced || hwmChanged) {
    pos.trailing_stop = parseFloat(newStop.toFixed(4));
    pos.trailing_stop_hwm = parseFloat(newHwm.toFixed(4));
    pos.trailing_stop_last_update = new Date().toISOString();
  }

  return {
    advanced,
    hwm_advanced: hwmChanged,
    old_stop: oldStop || null,
    new_stop: pos.trailing_stop,
    hwm: pos.trailing_stop_hwm,
    trail_pct: trailPct,
    breached: isLong ? livePrice <= pos.trailing_stop : livePrice >= pos.trailing_stop,
    reason: advanced ? "stop_advanced" : (hwmChanged ? "hwm_advanced" : "no_change"),
  };
}

/**
 * Process trailing stops for all positions in a state object.
 * Returns array of update results. Caller persists state if any advanced.
 * @param {Object} state - fund state
 * @param {Object} prices - keyed by position id → {price, ...}
 * @returns {Object[]} results per position that has trailing
 */
export function processTrailingStops(state, prices) {
  if (!state?.positions?.length) return [];
  const results = [];

  for (const pos of state.positions) {
    const hasTrail = pos.trailing_stop_pct != null && Number.isFinite(Number(pos.trailing_stop_pct));
    if (!hasTrail) continue;

    const livePrice = prices?.[pos.id]?.price;
    if (!Number.isFinite(livePrice)) continue;

    const r = updateTrailingStop(pos, livePrice);
    if (r.advanced || r.breached || r.hwm_advanced) {
      results.push({ ticker: pos.id, ...r });
    }
  }

  return results;
}

/**
 * Format a human-readable summary of trailing stop updates for logging / Telegram.
 */
export function formatTrailingUpdates(results) {
  if (!results?.length) return null;
  const advanced = results.filter(r => r.advanced);
  const breached = results.filter(r => r.breached);

  const lines = [];
  if (breached.length) {
    lines.push("🚨 TRAILING STOP BREACHED:");
    for (const b of breached) {
      lines.push(`  ${b.ticker}: price crossed trailing stop at $${b.new_stop} — close manually on T212`);
    }
  }
  if (advanced.length) {
    lines.push(`🔒 Trailing stops advanced (${advanced.length}):`);
    for (const a of advanced) {
      const moveBy = a.old_stop ? ((a.new_stop - a.old_stop)).toFixed(4) : "initial";
      lines.push(`  ${a.ticker}: $${a.old_stop || "—"} → $${a.new_stop} (HWM $${a.hwm}, trails ${a.trail_pct}%) ${a.old_stop ? "moved +$" + moveBy : ""}`);
    }
  }
  return lines.join("\n");
}
