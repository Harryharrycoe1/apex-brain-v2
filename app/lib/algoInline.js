// APEX BRAIN V5.2 — ALGO INLINE (Tiers 1-3)
// Runs inline with chat route. Provides real-time risk screens + signals.
//
// V5.2 CHANGES:
// - S1 ex-dividend awareness: if a position has ex_div_date == today, stop
//   alerts for that ticker are suppressed (prevents false breach on div drop)
// - S1 split detection: if position has possible_split flag in recent scans,
//   emit SPLIT_WARN yellow alert instead of red STOP alerts
// - Currency-aware display ($ for USD, £ for pence tickers)
//
// V5.1: S1 trailing-stop-aware: when pos.trailing_stop is set, STOP_WARN/CRITICAL
//   alerts are suppressed and replaced with a green TRAILING_ACTIVE info line.
//   TRAILING_STOP_BREACHED (RED) fires if live price crosses the trailing stop.
//
// V5.0 FIX (S2): Import canonical SECTOR_MAP from scannerAdvanced.js

import { ALGO_THRESHOLDS } from "../data/algoConfig.js";
import { SECTOR_MAP as CANONICAL_SECTOR_MAP, THEME_MAP } from "./scannerAdvanced.js";

// ═══ SAFE MATH ═══
function $(v, d = 2) { const n = Number(v); return isFinite(n) ? n.toFixed(d) : "—"; }

// ═══ DIRECTION-AWARE HELPERS ═══
function plPerUnit(entry, current, dir) {
  return (dir === "short" || dir === "sell") ? entry - current : current - entry;
}
function stopDistPct(current, stop, dir) {
  if (!current || !stop) return null;
  return (dir === "short" || dir === "sell")
    ? ((stop - current) / current) * 100
    : ((current - stop) / current) * 100;
}
function t1DistPct(current, t1, dir) {
  if (!current || !t1) return null;
  return (dir === "short" || dir === "sell")
    ? ((current - t1) / current) * 100
    : ((t1 - current) / current) * 100;
}
function liveRR(current, stop, t1, dir) {
  const risk = Math.abs(current - stop);
  const reward = Math.abs(t1 - current);
  if (!risk || risk === 0) return null;
  return reward / risk;
}
function isProfitable(entry, current, dir) {
  return plPerUnit(entry, current, dir) > 0;
}

// ═══ TIER 1: BASIC SCREENS ═══
function runScreens(positions, prices, account) {
  const screens = [];
  const nav = Number(account?.nav) || 1;
  const gbp = Number(account?.gbp_usd) || 1.34;
  const T = ALGO_THRESHOLDS;

  for (const pos of positions) {
    const lp = prices[pos.id]?.price;
    if (!lp) continue;
    const dir = (pos.direction || "buy").toLowerCase();
    const entry = Number(pos.entry_price);
    const units = Number(pos.units);

    // S1: Stop proximity — V5.2: ex-div + split aware, trailing-stop aware
    // V5.2 NEW: ex-dividend detection — if pos.ex_div_date is today, suppress stop alerts
    //   (dividend drops cause false breaches. APD pays $1.81 on April 1, drops from $285→$283.19)
    // V5.2 NEW: possible_split flag detected by worker — we emit SPLIT_WARN yellow, NOT stop alerts
    const hasTrailing = pos.trailing_stop != null && Number.isFinite(Number(pos.trailing_stop));
    const effectiveStop = hasTrailing ? Number(pos.trailing_stop) : pos.stop;

    // Ex-dividend today?
    const todayStr = new Date().toISOString().slice(0, 10);
    const isExDivToday = pos.ex_div_date && pos.ex_div_date.slice(0, 10) === todayStr;

    // Split flag?
    const hasSplitFlag = pos.possible_split === true;

    if (isExDivToday) {
      screens.push({
        ticker: pos.id, screen: "EX_DIV_TODAY", level: "INFO",
        detail: `💰 ${pos.id}: ex-dividend today (${pos.ex_div_amount ? `$${pos.ex_div_amount}/share` : ""}). Price drop expected — stop alerts suppressed.`,
        value: 0,
      });
    } else if (hasSplitFlag) {
      screens.push({
        ticker: pos.id, screen: "SPLIT_WARN", level: "AMBER",
        detail: `⚠️  ${pos.id}: possible stock split detected. Review HWM/stop values manually.`,
        value: 0,
      });
    } else if (effectiveStop) {
      const sd = stopDistPct(lp, effectiveStop, dir);

      if (hasTrailing) {
        // Trailing stop breach check (sd <= 0 means price has crossed the stop)
        if (sd !== null && sd <= 0) {
          const curr = pos.currency === "GBP" ? "£" : "$";
          screens.push({
            ticker: pos.id,
            screen: "TRAILING_STOP_BREACHED",
            level: "RED",
            detail: `Trailing stop BREACHED at ${curr}${effectiveStop} — close manually on T212. Live ${curr}${$(lp)}`,
            value: sd,
          });
        } else if (sd !== null) {
          // Active trailing — informational green, no warning levels
          const mode = pos.trailing_stop_mode || (pos.trailing_stop_distance != null ? "distance" : pos.trailing_stop_pct != null ? "pct" : null);
          const curr = pos.currency === "GBP" ? "£" : "$";
          let modeStr = "";
          if (mode === "distance" && pos.trailing_stop_distance != null) {
            const effPct = pos.trailing_stop_hwm > 0 ? ((pos.trailing_stop_hwm - effectiveStop) / pos.trailing_stop_hwm * 100).toFixed(1) : null;
            modeStr = ` (trails ${curr}${pos.trailing_stop_distance}${effPct ? ` / ${effPct}%` : ""})`;
          } else if (mode === "pct" && pos.trailing_stop_pct != null) {
            const effDist = pos.trailing_stop_hwm != null ? Math.abs(pos.trailing_stop_hwm - effectiveStop).toFixed(2) : null;
            modeStr = ` (trails ${pos.trailing_stop_pct}%${effDist ? ` / ${curr}${effDist}` : ""})`;
          }
          const hwmStr = pos.trailing_stop_hwm ? ` | HWM ${curr}${$(pos.trailing_stop_hwm)}` : "";
          const profitPerUnit = plPerUnit(entry, effectiveStop, dir);
          const lockedIn = profitPerUnit > 0 ? `locked +${curr}${$(profitPerUnit)}/u` : `stop at breakeven`;
          screens.push({
            ticker: pos.id,
            screen: "TRAILING_ACTIVE",
            level: "GREEN",
            detail: `🔒 Trailing at ${curr}${$(effectiveStop)}${modeStr}${hwmStr} — ${lockedIn}`,
            value: sd,
          });
        }
      } else {
        // Regular stop — original warning logic, currency aware
        const curr = pos.currency === "GBP" ? "£" : "$";
        if (sd !== null && sd < T.stop_proximity_critical) {
          screens.push({ ticker: pos.id, screen: "STOP_CRITICAL", level: "RED", detail: `${$(sd, 1)}% from stop (${curr}${pos.stop})`, value: sd });
        } else if (sd !== null && sd < T.stop_proximity_warn) {
          screens.push({ ticker: pos.id, screen: "STOP_WARN", level: "AMBER", detail: `${$(sd, 1)}% from stop (${curr}${pos.stop})`, value: sd });
        }
      }
    }

    // S2: T1 proximity
    if (pos.t1) {
      const td = t1DistPct(lp, pos.t1, dir);
      if (td !== null && td < T.t1_proximity && td > 0) {
        screens.push({ ticker: pos.id, screen: "T1_APPROACHING", level: "GREEN", detail: `${$(td, 1)}% from T1 ($${pos.t1})`, value: td });
      }
    }

    // S3: R:R deterioration — SMART: distinguish good vs bad
    if (pos.stop && pos.t1) {
      const rr = liveRR(lp, pos.stop, pos.t1, dir);
      const profitable = isProfitable(entry, lp, dir);
      if (rr !== null && rr < T.min_rr) {
        if (profitable) {
          // GOOD deterioration — price moved toward T1, compressing R:R naturally
          screens.push({ ticker: pos.id, screen: "RR_COMPRESSED_GOOD", level: "GREEN", detail: `R:R ${$(rr, 1)}:1 — trade working, approaching T1. Rule 8: let it run.`, value: rr });
        } else {
          if (rr < 1.5) {
            screens.push({ ticker: pos.id, screen: "RR_DETERIORATED", level: "RED", detail: `R:R now ${$(rr, 1)}:1 — losing AND poor R:R. Review exit.`, value: rr });
          } else {
            screens.push({ ticker: pos.id, screen: "RR_BELOW_MIN", level: "AMBER", detail: `R:R now ${$(rr, 1)}:1 — below 3:1 and position underwater`, value: rr });
          }
        }
      }
    }

    // S4: Daily loss cap (R2)
    const posRisk = Math.abs(lp - (pos.stop || lp)) * units;
    const posRiskGbp = pos.currency === "GBP" ? posRisk : posRisk / gbp;
    const riskPct = (posRiskGbp / nav) * 100;
    if (riskPct > T.daily_loss_cap * 2) {
      screens.push({ ticker: pos.id, screen: "R2_VIOLATION", level: "RED", detail: `${$(riskPct, 1)}% NAV at risk — exceeds 1% daily cap`, value: riskPct });
    }

    // S5: Position in loss
    if (!isProfitable(entry, lp, dir)) {
      const lossPct = Math.abs(plPerUnit(entry, lp, dir) / entry * 100);
      if (lossPct > 10) {
        screens.push({ ticker: pos.id, screen: "DEEP_LOSS", level: "RED", detail: `Down ${$(lossPct, 1)}% from entry`, value: lossPct });
      }
    }

    // S6: Turkey Rule (R11) — profitable > 10 days without review
    if (pos.entry_date) {
      const daysHeld = Math.floor((Date.now() - new Date(pos.entry_date).getTime()) / 86400000);
      if (daysHeld > T.turkey_days && isProfitable(entry, lp, dir)) {
        screens.push({ ticker: pos.id, screen: "TURKEY_RULE", level: "AMBER", detail: `Profitable ${daysHeld} days — R11 bear case review required`, value: daysHeld });
      }
    }
  }

  return screens;
}

// ═══ SECTOR LOOKUP — canonical + aliases ═══
// Scanner sectors vs strategy engine use different naming conventions.
// Map both namespaces so theme exposure reports are consistent regardless of input.
const SECTOR_ALIASES = {
  // strategy-engine-style → scanner-style
  banks: "Banks", semis: "Semis", mega_tech: "Tech", copper: "Copper",
  gold: "Gold", miners: "Mining", defence: "Defence", airlines: "Airlines",
  long_bonds: "LongBonds", short_bonds: "ShortBonds", utility_etf: "Utilities",
  energy: "Energy", refiner: "Energy", lng: "LNG", natgas: "NatGas",
  international: "Intl",
};

function getSector(ticker) {
  const t = (ticker || "").toUpperCase();
  // Prefer canonical scanner map (117 tickers, maintained source of truth)
  const canonical = CANONICAL_SECTOR_MAP[t];
  if (canonical) return canonical;
  return "Other";
}

// Normalise sector names from any source into canonical scanner labels
export function normaliseSector(s) {
  if (!s) return "Other";
  if (CANONICAL_SECTOR_MAP[s]) return CANONICAL_SECTOR_MAP[s]; // Already a ticker? shouldn't happen here
  return SECTOR_ALIASES[s] || s;
}

// ═══ TIER 2: CORRELATION AUDIT ═══
function runCorrelation(positions, account) {
  const nav = Number(account?.nav) || 1;
  const themes = {};

  for (const pos of positions) {
    const sector = getSector(pos.id);
    if (!themes[sector]) themes[sector] = { positions: [], exposure: 0 };
    themes[sector].positions.push(pos.id);
    const val = Number(pos.entry_price) * Number(pos.units);
    const gbp = pos.currency === "GBP" ? val : val / (Number(account?.gbp_usd) || 1.34);
    themes[sector].exposure += gbp;
  }

  const violations = [];
  for (const [theme, data] of Object.entries(themes)) {
    const pct = (data.exposure / nav) * 100;
    if (pct > ALGO_THRESHOLDS.max_single_theme) {
      violations.push({ theme, positions: data.positions, exposure_pct: parseFloat($(pct, 1)), level: "RED", detail: `${theme} at ${$(pct, 1)}% NAV — exceeds 40% R7 limit` });
    }
  }

  // Barbell check (R15)
  const sleeves = {};
  for (const pos of positions) {
    const s = pos.sleeve || "B";
    if (!sleeves[s]) sleeves[s] = 0;
    sleeves[s]++;
  }
  const hasIndependent = sleeves["Independent"] > 0 || sleeves["C"] > 0;
  if (!hasIndependent && positions.length >= 5) {
    violations.push({ theme: "BARBELL", positions: [], exposure_pct: 0, level: "AMBER", detail: "R15: No independent/hedge positions — barbell structure incomplete" });
  }

  return { themes: Object.fromEntries(Object.entries(themes).map(([k, v]) => [k, { ...v, pct: parseFloat($(v.exposure / nav * 100, 1)) }])), violations };
}

// ═══ TIER 3: PORTFOLIO RISK ═══
function runPortfolioRisk(positions, prices, account) {
  const nav = Number(account?.nav) || 1;
  const gbp = Number(account?.gbp_usd) || 1.34;
  let totalRisk = 0, totalExposure = 0, totalOpenPL = 0;
  const positionRisks = [];

  for (const pos of positions) {
    const lp = prices[pos.id]?.price;
    const entry = Number(pos.entry_price);
    const units = Number(pos.units);
    const dir = (pos.direction || "buy").toLowerCase();

    const expUsd = (lp || entry) * units;
    const expGbp = pos.currency === "GBP" ? expUsd : expUsd / gbp;
    totalExposure += expGbp;

    if (pos.stop && lp) {
      const riskUsd = Math.abs(lp - pos.stop) * units;
      const riskGbp = pos.currency === "GBP" ? riskUsd : riskUsd / gbp;
      totalRisk += riskGbp;
      positionRisks.push({ ticker: pos.id, risk_gbp: parseFloat($(riskGbp)), risk_pct: parseFloat($((riskGbp / nav) * 100, 1)) });
    }

    if (lp) {
      const pl = plPerUnit(entry, lp, dir) * units;
      totalOpenPL += pos.currency === "GBP" ? pl : pl / gbp;
    }
  }

  return {
    total_exposure_gbp: parseFloat($(totalExposure)),
    exposure_pct: parseFloat($((totalExposure / nav) * 100, 1)),
    total_risk_gbp: parseFloat($(totalRisk)),
    max_drawdown_pct: parseFloat($((totalRisk / nav) * 100, 1)),
    open_pl_gbp: parseFloat($(totalOpenPL)),
    position_risks: positionRisks,
    cash_pct: parseFloat($(((nav - totalExposure) / nav) * 100, 1)),
  };
}

// ═══ FORMAT DASHBOARD ═══
function formatDashboard(screens, correlation, risk) {
  const lines = ["=== ALGO ENGINE OUTPUT ==="];

  const reds = screens.filter(s => s.level === "RED");
  const ambers = screens.filter(s => s.level === "AMBER");
  const greens = screens.filter(s => s.level === "GREEN");

  if (reds.length) {
    lines.push(`\n🔴 RED ALERTS (${reds.length}):`);
    for (const s of reds) lines.push(`  ${s.ticker}: ${s.screen} — ${s.detail}`);
  }
  if (ambers.length) {
    lines.push(`\n🟡 WARNINGS (${ambers.length}):`);
    for (const s of ambers) lines.push(`  ${s.ticker}: ${s.screen} — ${s.detail}`);
  }
  if (greens.length) {
    lines.push(`\n🟢 SIGNALS (${greens.length}):`);
    for (const s of greens) lines.push(`  ${s.ticker}: ${s.screen} — ${s.detail}`);
  }

  if (correlation.violations.length) {
    lines.push(`\n⚠️ CORRELATION:`);
    for (const v of correlation.violations) lines.push(`  ${v.detail}`);
  }
  lines.push(`\nTHEME EXPOSURE:`);
  for (const [theme, data] of Object.entries(correlation.themes)) {
    lines.push(`  ${theme}: ${data.pct}% NAV (${data.positions.join(", ")})`);
  }

  lines.push(`\nPORTFOLIO RISK:`);
  lines.push(`  Exposure: £${risk.total_exposure_gbp} (${risk.exposure_pct}% NAV)`);
  lines.push(`  Max drawdown: £${risk.total_risk_gbp} (${risk.max_drawdown_pct}% NAV)`);
  lines.push(`  Open P&L: ${risk.open_pl_gbp >= 0 ? "+" : ""}£${risk.open_pl_gbp}`);
  lines.push(`  Cash: ${risk.cash_pct}% NAV`);

  return lines.join("\n");
}

// ═══ MAIN EXPORT ═══
export function runAlgoEngine(positions, prices, account) {
  if (!positions?.length) return { screens: [], correlation: { themes: {}, violations: [] }, risk: {}, dashboard: "=== ALGO ENGINE === No positions to analyse." };

  const screens = runScreens(positions, prices, account);
  const correlation = runCorrelation(positions, account);
  const risk = runPortfolioRisk(positions, prices, account);
  const dashboard = formatDashboard(screens, correlation, risk);

  return { screens, correlation, risk, dashboard };
}
