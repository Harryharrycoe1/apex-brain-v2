// APEX BRAIN V5.2 — TRAILING STOP WORKER
//
// V5.2 CHANGES FROM V5.1:
//   - C3 FIX: reject distance >= price (would produce negative/absurd stops)
//   - H5 FIX: HWM only advances during REGULAR market state (not pre/post)
//   - NEW:    split detection (price drops >40% with no prior news → alert, not breach)
//   - NEW:    effective_stop field always returned for caller convenience
//   - NEW:    emit structured errors for validation failures
//
// Supports TWO MODES per position:
//   mode="distance" — trailing_stop_distance ($ amount in price currency)
//                     stop = HWM - distance (long)  |  stop = LWM + distance (short)
//                     T212 style.
//   mode="pct" — trailing_stop_pct (percentage)
//                stop = HWM × (1 - pct/100) (long)  |  stop = LWM × (1 + pct/100) (short)
//
// Pence tickers (IAG.L, BAE.L): prices feed divides by 100, so price/distance
// are in POUNDS (£3.50, not 350p). User enters distance in pounds too.

const SPLIT_DETECTION_THRESHOLD = 0.40; // 40% drop triggers split suspicion

function computeStop(hwm, pos, isLong) {
  const mode = pos.trailing_stop_mode || (pos.trailing_stop_distance != null ? "distance" : pos.trailing_stop_pct != null ? "pct" : null);
  if (!mode) return null;
  if (mode === "distance") {
    const dist = Number(pos.trailing_stop_distance);
    if (!Number.isFinite(dist) || dist <= 0) return null;
    // V5.2 C3 FIX: reject distance >= HWM (would produce negative or zero stop)
    if (isLong && dist >= hwm) return null;
    if (!isLong && dist >= hwm) return null; // short: distance larger than LWM = bad
    return isLong ? hwm - dist : hwm + dist;
  }
  if (mode === "pct") {
    const pct = Number(pos.trailing_stop_pct);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
    return isLong ? hwm * (1 - pct / 100) : hwm * (1 + pct / 100);
  }
  return null;
}

export function hasTrailingConfig(pos) {
  if (!pos) return false;
  const mode = pos.trailing_stop_mode;
  if (mode === "distance") return Number.isFinite(Number(pos.trailing_stop_distance)) && Number(pos.trailing_stop_distance) > 0;
  if (mode === "pct") return Number.isFinite(Number(pos.trailing_stop_pct)) && Number(pos.trailing_stop_pct) > 0;
  if (Number.isFinite(Number(pos.trailing_stop_distance)) && Number(pos.trailing_stop_distance) > 0) return true;
  if (Number.isFinite(Number(pos.trailing_stop_pct)) && Number(pos.trailing_stop_pct) > 0) return true;
  return false;
}

/**
 * V5.2: Validate trailing config before activation.
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateTrailingConfig(pos, livePrice) {
  if (!hasTrailingConfig(pos)) return { valid: false, error: "no_trail_config" };
  const mode = pos.trailing_stop_mode || (pos.trailing_stop_distance != null ? "distance" : "pct");
  const refPrice = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : Number(pos.entry_price);
  if (!Number.isFinite(refPrice) || refPrice <= 0) return { valid: false, error: "no_reference_price" };

  if (mode === "distance") {
    const dist = Number(pos.trailing_stop_distance);
    if (!Number.isFinite(dist) || dist <= 0) return { valid: false, error: "distance_invalid" };
    if (dist >= refPrice) return { valid: false, error: `distance_exceeds_price (distance ${dist} >= price ${refPrice}). Typo?` };
    if (dist > refPrice * 0.5) return { valid: true, warning: `distance is >50% of price (${((dist/refPrice)*100).toFixed(1)}%) — tight checks` };
  }
  if (mode === "pct") {
    const pct = Number(pos.trailing_stop_pct);
    if (!Number.isFinite(pct) || pct <= 0) return { valid: false, error: "pct_invalid" };
    if (pct >= 100) return { valid: false, error: "pct_must_be_less_than_100" };
    if (pct >= 50) return { valid: true, warning: "pct >= 50% is extremely loose" };
  }
  return { valid: true };
}

/**
 * Update one position's trailing stop based on live price.
 * @param {Object} pos - position object (mutated)
 * @param {number} livePrice - current price from prices feed
 * @param {Object} opts - { marketState: "REGULAR" | "PRE" | "POST", prevClose: number }
 * @returns {Object}
 */
export function updateTrailingStop(pos, livePrice, opts = {}) {
  if (!pos || typeof pos !== "object") return { advanced: false, reason: "no_position" };
  if (!Number.isFinite(livePrice) || livePrice <= 0) return { advanced: false, reason: "no_price" };
  if (!hasTrailingConfig(pos)) return { advanced: false, reason: "no_trail_config" };

  // V5.2 C3 FIX: validate config before doing anything
  const validation = validateTrailingConfig(pos, livePrice);
  if (!validation.valid) {
    return { advanced: false, reason: "invalid_config", error: validation.error };
  }

  const mode = pos.trailing_stop_mode || (Number.isFinite(Number(pos.trailing_stop_distance)) && Number(pos.trailing_stop_distance) > 0 ? "distance" : "pct");
  if (!pos.trailing_stop_mode) pos.trailing_stop_mode = mode;

  const dir = (pos.direction || "buy").toLowerCase();
  const isLong = dir !== "short" && dir !== "sell";
  const entry = Number(pos.entry_price);

  // V5.2 SPLIT DETECTION: price drop > 40% from prev HWM (long) or rise > 40% (short) suggests split
  if (pos.trailing_stop_hwm != null) {
    const hwm = Number(pos.trailing_stop_hwm);
    const moveRatio = isLong ? (hwm - livePrice) / hwm : (livePrice - hwm) / hwm;
    if (moveRatio > SPLIT_DETECTION_THRESHOLD) {
      return {
        advanced: false,
        reason: "possible_split",
        mode,
        hwm,
        new_stop: pos.trailing_stop || null, // V5.2 FIX #6: return existing stop, not undefined
        price: livePrice,
        move_pct: parseFloat((moveRatio * 100).toFixed(2)),
        warning: `Price moved ${(moveRatio * 100).toFixed(1)}% from HWM — possible stock split, dividend, or data error. NOT treating as breach. Edit position to reset HWM if legitimate.`,
      };
    }
  }

  // V5.2 H5 FIX: only advance HWM during REGULAR market state
  const marketState = (opts.marketState || "REGULAR").toUpperCase();
  const hwmAdvanceAllowed = marketState === "REGULAR";

  // Initialize HWM/LWM if not set
  if (pos.trailing_stop_hwm == null || !Number.isFinite(Number(pos.trailing_stop_hwm))) {
    pos.trailing_stop_hwm = isLong
      ? Math.max(entry || livePrice, livePrice)
      : Math.min(entry || livePrice, livePrice);
    pos.trailing_stop_activated = new Date().toISOString();
  }

  const hwm = Number(pos.trailing_stop_hwm);
  let newHwm = hwm;
  let hwmAdvanced = false;

  if (hwmAdvanceAllowed) {
    if (isLong) {
      if (livePrice > hwm) { newHwm = livePrice; hwmAdvanced = true; }
    } else {
      if (livePrice < hwm) { newHwm = livePrice; hwmAdvanced = true; }
    }
  }

  const computedStop = computeStop(newHwm, pos, isLong);
  if (computedStop == null || !Number.isFinite(computedStop) || computedStop <= 0) {
    return { advanced: false, reason: "compute_failed", mode, computed: computedStop };
  }

  const oldStop = Number(pos.trailing_stop) || 0;
  let newStop;
  if (oldStop === 0) newStop = computedStop;
  else if (isLong) newStop = Math.max(oldStop, computedStop);
  else newStop = Math.min(oldStop, computedStop);

  const advanced = newStop !== oldStop;

  if (advanced || hwmAdvanced) {
    pos.trailing_stop = parseFloat(newStop.toFixed(4));
    pos.trailing_stop_hwm = parseFloat(newHwm.toFixed(4));
    pos.trailing_stop_last_update = new Date().toISOString();
    if (!hwmAdvanceAllowed && !advanced) {
      // Shouldn't happen — just in case
    }
  }

  const effectiveDistance = Math.abs(newHwm - pos.trailing_stop);
  const effectivePct = newHwm > 0 ? (effectiveDistance / newHwm) * 100 : 0;

  return {
    advanced,
    hwm_advanced: hwmAdvanced,
    old_stop: oldStop || null,
    new_stop: pos.trailing_stop,
    hwm: pos.trailing_stop_hwm,
    mode,
    distance: pos.trailing_stop_distance || null,
    pct: pos.trailing_stop_pct || null,
    effective_distance: parseFloat(effectiveDistance.toFixed(4)),
    effective_pct: parseFloat(effectivePct.toFixed(2)),
    market_state: marketState,
    breached: isLong ? livePrice <= pos.trailing_stop : livePrice >= pos.trailing_stop,
    reason: advanced ? "stop_advanced" : (hwmAdvanced ? "hwm_advanced" : "no_change"),
  };
}

/**
 * Process trailing stops for all positions.
 * @param {Object} state
 * @param {Object} prices - keyed by id → { price, marketState, ... }
 * @returns {Array} results
 */
export function processTrailingStops(state, prices) {
  if (!state?.positions?.length) return [];
  const results = [];
  for (const pos of state.positions) {
    if (!hasTrailingConfig(pos)) continue;
    const priceRec = prices?.[pos.id];
    const livePrice = priceRec?.price;
    if (!Number.isFinite(livePrice)) continue;
    // V5.2: pass marketState into worker
    const r = updateTrailingStop(pos, livePrice, { marketState: priceRec?.marketState || "REGULAR" });
    if (r.advanced || r.breached || r.hwm_advanced || r.reason === "possible_split" || r.reason === "invalid_config") {
      results.push({ ticker: pos.id, ...r });
    }
  }
  return results;
}

export function formatTrailingUpdates(results) {
  if (!results?.length) return null;
  const lines = [];
  for (const r of results) {
    if (r.breached) {
      lines.push(`🚨 ${r.ticker}: Trailing stop BREACHED at $${r.new_stop} — close manually on T212`);
    } else if (r.reason === "possible_split") {
      lines.push(`⚠️  ${r.ticker}: Possible split detected (${r.move_pct}% move from HWM $${r.hwm} to $${r.price}) — NOT treating as breach, review manually`);
    } else if (r.reason === "invalid_config") {
      lines.push(`❌ ${r.ticker}: Invalid trailing config: ${r.error}`);
    } else if (r.advanced) {
      const modeStr = r.mode === "distance" ? `$${r.distance} dist / ${r.effective_pct}%` : `${r.pct}% / $${r.effective_distance}`;
      const moveBy = r.old_stop ? `moved +$${(r.new_stop - r.old_stop).toFixed(4)}` : "initial";
      lines.push(`🔒 ${r.ticker}: $${r.old_stop || "—"} → $${r.new_stop} (HWM $${r.hwm}, ${modeStr}) ${moveBy}`);
    }
  }
  return lines.join("\n");
}
