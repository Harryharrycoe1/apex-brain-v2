// APEX BRAIN V5.1 — TRAILING STOP WORKER
//
// Called from /api/prices on every tick to update trailing stops on open positions.
// Never moves stops against the position (ratchet only).
//
// Supports TWO MODES per position:
//   mode="distance" — trailing_stop_distance ($ amount in price currency)
//                     stop = HWM - distance (long)  |  stop = LWM + distance (short)
//                     T212 style. Example: CVX at $220, distance $3 → stop at $217.
//
//   mode="pct" — trailing_stop_pct (percentage)
//                stop = HWM × (1 - pct/100) (long)  |  stop = LWM × (1 + pct/100) (short)
//                Ratio-based. Example: CVX at $220, pct 5 → stop at $209.
//
// Pence tickers (IAG.L, BAE.L): prices feed divides by 100, so price/distance
// are in POUNDS (£3.50, not 350p). User enters distance in pounds too.

function computeStop(hwm, pos, isLong) {
  const mode = pos.trailing_stop_mode || (pos.trailing_stop_distance != null ? "distance" : pos.trailing_stop_pct != null ? "pct" : null);
  if (!mode) return null;
  if (mode === "distance") {
    const dist = Number(pos.trailing_stop_distance);
    if (!Number.isFinite(dist) || dist <= 0) return null;
    return isLong ? hwm - dist : hwm + dist;
  }
  if (mode === "pct") {
    const pct = Number(pos.trailing_stop_pct);
    if (!Number.isFinite(pct) || pct <= 0) return null;
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

export function updateTrailingStop(pos, livePrice) {
  if (!pos || typeof pos !== "object") return { advanced: false, reason: "no_position" };
  if (!Number.isFinite(livePrice) || livePrice <= 0) return { advanced: false, reason: "no_price" };
  if (!hasTrailingConfig(pos)) return { advanced: false, reason: "no_trail_config" };

  const mode = pos.trailing_stop_mode || (Number.isFinite(Number(pos.trailing_stop_distance)) && Number(pos.trailing_stop_distance) > 0 ? "distance" : "pct");
  if (!pos.trailing_stop_mode) pos.trailing_stop_mode = mode;

  const dir = (pos.direction || "buy").toLowerCase();
  const isLong = dir !== "short" && dir !== "sell";
  const entry = Number(pos.entry_price);

  if (pos.trailing_stop_hwm == null || !Number.isFinite(Number(pos.trailing_stop_hwm))) {
    pos.trailing_stop_hwm = isLong
      ? Math.max(entry || livePrice, livePrice)
      : Math.min(entry || livePrice, livePrice);
    pos.trailing_stop_activated = new Date().toISOString();
  }

  const hwm = Number(pos.trailing_stop_hwm);
  let newHwm = hwm;
  let hwmAdvanced = false;
  if (isLong) { if (livePrice > hwm) { newHwm = livePrice; hwmAdvanced = true; } }
  else { if (livePrice < hwm) { newHwm = livePrice; hwmAdvanced = true; } }

  const computedStop = computeStop(newHwm, pos, isLong);
  if (computedStop == null) return { advanced: false, reason: "compute_failed", mode };

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
  }

  const effectiveDistance = Math.abs(newHwm - newStop);
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
    breached: isLong ? livePrice <= pos.trailing_stop : livePrice >= pos.trailing_stop,
    reason: advanced ? "stop_advanced" : (hwmAdvanced ? "hwm_advanced" : "no_change"),
  };
}

export function processTrailingStops(state, prices) {
  if (!state?.positions?.length) return [];
  const results = [];
  for (const pos of state.positions) {
    if (!hasTrailingConfig(pos)) continue;
    const livePrice = prices?.[pos.id]?.price;
    if (!Number.isFinite(livePrice)) continue;
    const r = updateTrailingStop(pos, livePrice);
    if (r.advanced || r.breached || r.hwm_advanced) results.push({ ticker: pos.id, ...r });
  }
  return results;
}

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
      const modeStr = a.mode === "distance" ? `$${a.distance} dist` : `${a.pct}%`;
      const moveBy = a.old_stop ? ((a.new_stop - a.old_stop)).toFixed(4) : "initial";
      lines.push(`  ${a.ticker}: $${a.old_stop || "—"} → $${a.new_stop} (HWM $${a.hwm}, ${modeStr}) ${a.old_stop ? "moved +$" + moveBy : ""}`);
    }
  }
  return lines.join("\n");
}
