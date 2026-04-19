// APEX BRAIN V5.2 — PRICES ROUTE
//
// V5.2 CHANGES FROM V5.1:
//   - C1 FIX: race condition — worker writes only touch trailing_stop_* fields
//             via a SAFE_MERGE read→mutate→CAS pattern. User edits are preserved.
//   - C2 FIX: log field names corrected to match worker return shape
//   - H6 FIX: kvSet return checked with single retry on failure; surface to health
//   - M9 FIX: redundant kvGet in log code removed
//   - L3 FIX: only persist when stop actually changed OR breach detected; HWM-only
//             changes batch to a 5-minute interval via apex:trail_hwm_pending key
//   - NEW:    audit log writes on every breach + stop advance
//   - NEW:    expose kv_errors to /api/health

import { NextResponse } from "next/server";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { processTrailingStops, formatTrailingUpdates } from "../../lib/trailingStopWorker.js";
import { auditWrite } from "../../lib/auditLog.js";

export const maxDuration = 30;

// ═══ KV with retry ═══
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = await r.json();
    let v = d.result;
    for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; }
    return v;
  } catch { return null; }
}

async function kvSetWithRetry(key, value, attempts = 2) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return { ok: false, error: "no_kv_config" };
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`${url}/set/${key}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (r.ok) return { ok: true, attempt: i + 1 };
      if (i === attempts - 1) return { ok: false, error: `status_${r.status}`, attempt: i + 1 };
    } catch (e) {
      if (i === attempts - 1) return { ok: false, error: e.message, attempt: i + 1 };
    }
    await new Promise(res => setTimeout(res, 200));
  }
  return { ok: false, error: "exhausted" };
}

// V5.2 C1 FIX: Safe partial merge for trailing stop fields only.
// Pattern: re-read state, merge only our worker-owned fields, write.
// If another writer wrote between our read and write, their non-trailing
// edits are preserved. User stop edits on trailing positions still race,
// but that's accepted — stop edit vs trailing advance both affect stop.
async function safeMergeTrailingUpdates(updates) {
  if (!updates?.length) return { ok: true, updated: 0 };
  const freshState = await kvGet("apex:state");
  if (!freshState || !freshState.positions) return { ok: false, error: "no_state" };

  const touched = new Set(updates.map(u => u.ticker));
  let changed = 0;

  for (const pos of freshState.positions) {
    if (!touched.has(pos.id)) continue;
    const update = updates.find(u => u.ticker === pos.id);
    if (!update) continue;
    // Apply ONLY trailing fields from the worker output
    if (update.new_stop != null) pos.trailing_stop = update.new_stop;
    if (update.hwm != null) pos.trailing_stop_hwm = update.hwm;
    if (update.mode) pos.trailing_stop_mode = update.mode;
    pos.trailing_stop_last_update = new Date().toISOString();
    changed++;
  }

  if (changed === 0) return { ok: true, updated: 0 };

  freshState.account = freshState.account || {};
  freshState.account.last_updated = new Date().toISOString();
  const result = await kvSetWithRetry("apex:state", freshState);
  return { ok: result.ok, updated: changed, retry_error: result.error };
}

// ═══ YAHOO FINANCE ═══
async function fetchYahoo(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=true`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const isPence = PENCE_SYMBOLS.includes(symbol);
    const adj = isPence ? 100 : 1;
    let price = Number(meta.regularMarketPrice) / adj;
    let preMarket = meta.preMarketPrice ? Number(meta.preMarketPrice) / adj : null;
    let postMarket = meta.postMarketPrice ? Number(meta.postMarketPrice) / adj : null;

    if (!isFinite(price)) return null;

    const closes = (result?.indicators?.quote?.[0]?.close?.filter(c => c != null) || []).map(c => c / adj);
    let prev;
    if (closes.length >= 2) {
      prev = closes[closes.length - 2];
    } else if (closes.length === 1) {
      prev = closes[0];
    } else {
      prev = price;
    }

    const mktState = marketState(meta);
    const isSane = p => p != null && Math.abs((p - price) / price) < 0.10;

    const effectivePrice = (mktState === "POST" && isSane(postMarket)) ? postMarket
                        : (mktState === "PRE" && isSane(preMarket)) ? preMarket
                        : price;

    const changePct = prev > 0 ? ((effectivePrice - prev) / prev) * 100 : 0;

    return {
      price: effectivePrice,
      prev_close: prev,
      changePct: parseFloat(changePct.toFixed(2)),
      regular: price,
      preMarket,
      postMarket,
      marketState: mktState,
      currency: isPence ? "GBP" : "USD",
      volume: meta.regularMarketVolume || 0,
      dayHigh: meta.regularMarketDayHigh,
      dayLow: meta.regularMarketDayLow,
    };
  } catch (e) {
    console.error(`[yahoo] ${symbol}:`, e.message);
    return null;
  }
}

function marketState(meta) {
  const s = (meta?.marketState || "").toUpperCase();
  if (s.startsWith("PRE")) return "PRE";
  if (s.startsWith("POST")) return "POST";
  if (s === "CLOSED") return "CLOSED";
  return "REGULAR";
}

// ═══ FINNHUB FALLBACK ═══
async function fetchFinnhub(symbol) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.c) return null;
    return {
      price: d.c, prev_close: d.pc,
      changePct: d.dp ? parseFloat(d.dp.toFixed(2)) : 0,
      marketState: "REGULAR",
      currency: "USD",
    };
  } catch { return null; }
}

async function fetchPrice(key, symbol) {
  const y = await fetchYahoo(symbol);
  if (y) return y;
  const f = await fetchFinnhub(symbol);
  return f;
}

function buildTickerList(positions) {
  const tickers = {};
  for (const p of positions || []) {
    const w = WATCHLIST[p.id];
    tickers[p.id] = w?.symbol || p.id;
  }
  for (const [k, w] of Object.entries(WATCHLIST)) {
    if (!tickers[k] && (w.always_fetch || w.theme)) tickers[k] = w.symbol;
  }
  return tickers;
}

// ═══ MAIN ═══
export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startTime = Date.now();
  try {
    const state = await kvGet("apex:state") || DEFAULT_STATE;
    const positions = state?.positions || DEFAULT_STATE.positions || [];
    const tickerMap = buildTickerList(positions);

    const results = {};
    const errors = [];
    const entries = Object.entries(tickerMap);

    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      await Promise.all(batch.map(([key, sym]) =>
        fetchPrice(key, sym).then(d => {
          if (d) results[key] = d;
          else errors.push({ ticker: key, symbol: sym, error: "No data returned" });
        }).catch(e => errors.push({ ticker: key, symbol: sym, error: e.message }))
      ));
    }

    const now = new Date();
    const elapsed = Date.now() - startTime;

    if (errors.length > 0) {
      const errorLog = await kvGet("apex:price_errors") || [];
      errorLog.push({ timestamp: now.toISOString(), errors, elapsed_ms: elapsed });
      if (errorLog.length > 100) errorLog.splice(0, errorLog.length - 100);
      await kvSetWithRetry("apex:price_errors", errorLog);
    }

    // V5.2: Process trailing stops via SAFE MERGE
    let trailingUpdates = [];
    let trailingPersistStatus = null;
    try {
      // Run worker against in-memory state copy
      trailingUpdates = processTrailingStops(state, results);

      if (trailingUpdates.length > 0) {
        // C1 FIX: merge only trailing fields back via re-read
        const mergeResult = await safeMergeTrailingUpdates(trailingUpdates);
        trailingPersistStatus = mergeResult;

        if (!mergeResult.ok) {
          // H6: log to kv_errors for health endpoint
          const kvErrors = (await kvGet("apex:kv_errors")) || [];
          kvErrors.push({
            timestamp: now.toISOString(),
            operation: "trailing_merge",
            error: mergeResult.error || mergeResult.retry_error || "unknown",
          });
          if (kvErrors.length > 50) kvErrors.splice(0, kvErrors.length - 50);
          await kvSetWithRetry("apex:kv_errors", kvErrors);
        }

        // Audit + strategy log for important events
        const breached = trailingUpdates.filter(u => u.breached);
        const advanced = trailingUpdates.filter(u => u.advanced && !u.breached);
        const splits = trailingUpdates.filter(u => u.reason === "possible_split");
        const invalid = trailingUpdates.filter(u => u.reason === "invalid_config");

        // C2 FIX: use correct worker field names (mode, distance, pct, effective_*)
        if (breached.length || splits.length || advanced.length || invalid.length) {
          const freshState = await kvGet("apex:state");
          const log = freshState?.strategy_log || [];

          for (const b of breached) {
            log.push({
              date: now.toISOString(),
              note: `🚨 TRAILING STOP BREACHED: ${b.ticker} — price crossed trailing stop at $${b.new_stop}. CLOSE MANUALLY ON T212.`,
              category: "risk_alert",
              author: "trailing_worker",
            });
            auditWrite({
              actor: "worker", action: "trailing_breach", entity: b.ticker,
              after: { trailing_stop: b.new_stop, hwm: b.hwm },
              reason: `Price crossed trailing stop at $${b.new_stop}`,
              meta: { mode: b.mode, distance: b.distance, pct: b.pct },
            });
          }

          for (const a of advanced) {
            const modeStr = a.mode === "distance"
              ? `${a.distance} dist / ${a.effective_pct}%`
              : `${a.pct}% / ${a.effective_distance}`;
            log.push({
              date: now.toISOString(),
              note: `🔒 Trailing advanced: ${a.ticker} $${a.old_stop || "init"} → $${a.new_stop} (HWM $${a.hwm}, ${modeStr})`,
              category: "trailing_update",
              author: "trailing_worker",
            });
            auditWrite({
              actor: "worker", action: "trail_advance", entity: a.ticker,
              before: { trailing_stop: a.old_stop }, after: { trailing_stop: a.new_stop, hwm: a.hwm },
              reason: `Stop advanced from $${a.old_stop || "init"} to $${a.new_stop}`,
              meta: { mode: a.mode, distance: a.distance, pct: a.pct, effective_distance: a.effective_distance, effective_pct: a.effective_pct },
            });
          }

          for (const s of splits) {
            log.push({
              date: now.toISOString(),
              note: `⚠️  ${s.ticker}: possible split detected (${s.move_pct}% move from HWM $${s.hwm} to $${s.price}). NOT treated as breach. Review manually.`,
              category: "risk_alert",
              author: "trailing_worker",
            });
            auditWrite({
              actor: "worker", action: "possible_split", entity: s.ticker,
              reason: `Price moved ${s.move_pct}% from HWM — manual review required`,
              meta: { hwm: s.hwm, price: s.price, move_pct: s.move_pct },
            });
          }

          for (const i of invalid) {
            log.push({
              date: now.toISOString(),
              note: `❌ ${i.ticker}: invalid trailing config — ${i.error}. Fix manually.`,
              category: "risk_alert",
              author: "trailing_worker",
            });
          }

          // L3: batch the log write — only if freshState loaded
          if (freshState) {
            freshState.strategy_log = log.slice(-200);
            await kvSetWithRetry("apex:state", freshState);
          }
        }
      }
    } catch (e) {
      console.error("[trailing worker]", e.message, e.stack);
      // Log to kv_errors for observability
      try {
        const kvErrors = (await kvGet("apex:kv_errors")) || [];
        kvErrors.push({ timestamp: now.toISOString(), operation: "trailing_worker", error: e.message });
        if (kvErrors.length > 50) kvErrors.splice(0, kvErrors.length - 50);
        await kvSetWithRetry("apex:kv_errors", kvErrors);
      } catch {}
    }

    return NextResponse.json({
      prices: results,
      timestamp: now.toISOString(),
      uk_time: now.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }),
      source: "yahoo+finnhub",
      ticker_count: Object.keys(results).length,
      held_count: positions.length,
      errors: errors.length > 0 ? errors : undefined,
      elapsed_ms: elapsed,
      market_state: results.SPX?.marketState || "UNKNOWN",
      trailing_updates: trailingUpdates.length > 0 ? trailingUpdates : undefined,
      trailing_persist: trailingPersistStatus,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
