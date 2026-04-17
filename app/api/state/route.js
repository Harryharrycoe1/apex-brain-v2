import { NextResponse } from "next/server";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { WATCHLIST } from "../../data/algoConfig.js";

export const maxDuration = 30;

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try { const r = await fetch(`${url}/set/${key}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) }); return r.ok; } catch { return false; }
}

function validateTicker(ticker) {
  if (!ticker || typeof ticker !== "string") return { valid: false, error: "Missing ticker" };
  const upper = ticker.toUpperCase().trim();
  if (upper.length < 1 || upper.length > 10) return { valid: false, error: "Invalid ticker length" };
  if (WATCHLIST[upper]) return { valid: true, ticker: upper };
  const typos = { JMP: "JPM", MSOF: "MSFT", NVID: "NVDA" };
  if (typos[upper]) return { valid: true, ticker: typos[upper], corrected: true, original: upper };
  return { valid: true, ticker: upper, unknown: true };
}

function calcPL(entry, exit, units, direction) {
  const dir = (direction || "buy").toLowerCase();
  return (dir === "short" || dir === "sell") ? (entry - exit) * units : (exit - entry) * units;
}

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let state = await kvGet("apex:state");
  if (state) {
    // ═══ V4.8 MIGRATION: wipe legacy manual pipeline (now APEX scanner + active pipeline) ═══
    let changed = false;
    if (!state.v48_migrated) {
      state.pipeline = [];
      state.active_pipeline = state.active_pipeline || [];
      state.v48_migrated = true;
      changed = true;
    }
    if (!state.active_pipeline) { state.active_pipeline = []; changed = true; }
    if (changed) await kvSet("apex:state", state);
    return NextResponse.json({ state, source: "kv" });
  }
  const init = { ...DEFAULT_STATE, pipeline: [], active_pipeline: [], v48_migrated: true };
  return NextResponse.json({ state: init, source: "default" });
}

export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;
    let state = await kvGet("apex:state") || { ...DEFAULT_STATE };

    switch (action) {
      case "full_replace": {
        const ok = await kvSet("apex:state", body.state);
        return NextResponse.json({ ok, action: "full_replace" });
      }

      case "sync_account": {
        if (body.nav != null) state.account.nav = Number(body.nav);
        if (body.cash != null) state.account.cash = Number(body.cash);
        if (body.margin != null) state.account.margin_used = Number(body.margin);
        if (body.health != null) state.account.margin_health_pct = Number(body.health);
        if (body.gbp_usd != null) state.account.gbp_usd = Number(body.gbp_usd);
        state.account.last_updated = new Date().toISOString();
        if (state.account.nav > (state.account.high_water_mark || 0)) state.account.high_water_mark = state.account.nav;
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "sync_account", account: state.account });
      }

      case "add_position": {
        const v = validateTicker(body.ticker || body.id);
        if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });
        if (v.corrected) return NextResponse.json({ error: `Ticker "${v.original}" not found. Did you mean "${v.ticker}"?`, suggestion: v.ticker }, { status: 400 });
        const existing = (state.positions || []).findIndex(p => p.id === v.ticker);
        if (existing >= 0) return NextResponse.json({ error: `${v.ticker} already exists. Close first or use update_position.` }, { status: 400 });

        const pos = {
          id: v.ticker, name: body.name || WATCHLIST[v.ticker]?.name || v.ticker,
          sleeve: body.sleeve || "B", direction: (body.direction || "buy").toLowerCase(),
          units: Number(body.units) || 0, entry_price: Number(body.entry_price) || 0,
          entry_date: body.entry_date || new Date().toISOString(), currency: body.currency || "USD",
          stop: body.stop != null ? Number(body.stop) : null, trailing_stop: body.trailing_stop != null ? Number(body.trailing_stop) : null,
          t1: body.t1 != null ? Number(body.t1) : null, t2: body.t2 != null ? Number(body.t2) : null,
          kill_switch: body.kill_switch || "", peace_action: body.peace_action || "",
          thesis: body.thesis || "", conviction: Number(body.conviction) || 3, notes: body.notes || "",
        };
        if (!state.positions) state.positions = [];
        state.positions.push(pos);
        state.account.last_updated = new Date().toISOString();

        // Log strategy event
        await logStrategy(state, `OPENED ${v.ticker} ${pos.direction.toUpperCase()} ${pos.units}u @ $${pos.entry_price} [${pos.sleeve}] — ${pos.thesis || "no thesis"}`);

        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "add_position", position: pos, warning: v.unknown ? `${v.ticker} not in watchlist` : undefined });
      }

      // ═══ UPDATE ANY FIELD ON AN EXISTING POSITION ═══
      case "update_position": {
        const ticker = (body.ticker || body.id || "").toUpperCase();
        const idx = (state.positions || []).findIndex(p => p.id === ticker);
        if (idx < 0) return NextResponse.json({ error: `${ticker} not found` }, { status: 404 });

        const pos = state.positions[idx];
        const changes = [];

        // Update any field that's provided
        if (body.stop !== undefined) {
          const newStop = Number(body.stop);
          const dir = (pos.direction || "buy").toLowerCase();
          if (pos.stop && ((dir === "buy" && newStop < pos.stop) || (dir === "short" && newStop > pos.stop))) {
            return NextResponse.json({ error: `R1 VIOLATION: Cannot move stop against ${dir.toUpperCase()} position` }, { status: 400 });
          }
          changes.push(`Stop: $${pos.stop} → $${newStop}`);
          pos.stop = newStop;
        }
        if (body.trailing_stop !== undefined) { changes.push(`Trailing: $${pos.trailing_stop} → $${body.trailing_stop}`); pos.trailing_stop = Number(body.trailing_stop); }
        if (body.t1 !== undefined) { changes.push(`T1: $${pos.t1} → $${body.t1}`); pos.t1 = Number(body.t1); }
        if (body.t2 !== undefined) { changes.push(`T2: $${pos.t2} → $${body.t2}`); pos.t2 = Number(body.t2); }
        if (body.units !== undefined) { changes.push(`Units: ${pos.units} → ${body.units}`); pos.units = Number(body.units); }
        if (body.sleeve !== undefined) { changes.push(`Sleeve: ${pos.sleeve} → ${body.sleeve}`); pos.sleeve = body.sleeve; }
        if (body.direction !== undefined) { changes.push(`Direction: ${pos.direction} → ${body.direction}`); pos.direction = body.direction.toLowerCase(); }
        if (body.thesis !== undefined) { changes.push(`Thesis updated`); pos.thesis = body.thesis; }
        if (body.conviction !== undefined) { changes.push(`Conviction: ${pos.conviction} → ${body.conviction}`); pos.conviction = Number(body.conviction); }
        if (body.kill_switch !== undefined) { pos.kill_switch = body.kill_switch; changes.push("Kill switch updated"); }
        if (body.peace_action !== undefined) { pos.peace_action = body.peace_action; changes.push("Peace action updated"); }
        if (body.notes !== undefined) { pos.notes = body.notes; changes.push("Notes updated"); }
        if (body.name !== undefined) { pos.name = body.name; }

        state.positions[idx] = pos;
        state.account.last_updated = new Date().toISOString();

        if (changes.length) await logStrategy(state, `UPDATED ${ticker}: ${changes.join(", ")}`);

        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "update_position", ticker, changes, position: pos });
      }

      case "close_position": {
        const ticker = (body.ticker || body.id || "").toUpperCase();
        const idx = (state.positions || []).findIndex(p => p.id === ticker);
        if (idx < 0) return NextResponse.json({ error: `${ticker} not found` }, { status: 404 });

        const pos = state.positions[idx];
        const exitPrice = Number(body.exit_price) || Number(pos.entry_price);
        const rawPL = calcPL(pos.entry_price, exitPrice, pos.units, pos.direction);
        const gbpUsd = Number(state.account?.gbp_usd) || 1.34;
        const plGbp = pos.currency === "GBP" ? rawPL : rawPL / gbpUsd;

        const closed = {
          id: `${ticker}-${Date.now()}`, ticker, name: pos.name, direction: pos.direction || "buy",
          entry_price: pos.entry_price, exit_price: exitPrice, units: pos.units,
          sleeve: pos.sleeve, entry_date: pos.entry_date, exit_date: new Date().toISOString(),
          net_pl: Math.round(plGbp * 100) / 100, reason: body.reason || "Manual close",
          exit_type: body.exit_type || "manual", thesis: pos.thesis,
        };
        if (!state.closed) state.closed = [];
        state.closed.push(closed);
        state.positions.splice(idx, 1);
        state.account.total_realised_pl = Math.round(((state.account.total_realised_pl || 0) + plGbp) * 100) / 100;
        state.account.last_updated = new Date().toISOString();

        await logStrategy(state, `CLOSED ${ticker} @ $${exitPrice} | P&L: ${plGbp >= 0 ? "+" : ""}£${plGbp.toFixed(2)} | ${body.reason || "Manual"}`);

        // ═══ Mark setup tracker outcome for hit-rate calibration ═══
        try {
          const tracker = await kvGet("apex:setup_tracker") || { suggestions: [] };
          let updated = false;
          // Find most recent suggestion for this ticker where outcome is null and entry matches
          for (let i = tracker.suggestions.length - 1; i >= 0; i--) {
            const s = tracker.suggestions[i];
            if (s.ticker === ticker && !s.outcome && Math.abs(s.entry - pos.entry_price) / s.entry < 0.03) {
              s.outcome = {
                exit_price: exitPrice,
                pl_gbp: plGbp,
                pl_pct: ((exitPrice - pos.entry_price) / pos.entry_price) * 100 * (pos.direction === "short" ? -1 : 1),
                hit_t1: pos.direction === "buy" ? exitPrice >= s.t1 : exitPrice <= s.t1,
                hit_stop: pos.direction === "buy" ? exitPrice <= s.stop : exitPrice >= s.stop,
                exit_date: closed.exit_date,
                reason: body.reason || "Manual close",
              };
              updated = true;
              break;
            }
          }
          if (updated) await kvSet("apex:setup_tracker", tracker);
        } catch {}

        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "close_position", closed });
      }

      case "partial_close": {
        const ticker = (body.ticker || body.id || "").toUpperCase();
        const idx = (state.positions || []).findIndex(p => p.id === ticker);
        if (idx < 0) return NextResponse.json({ error: `${ticker} not found` }, { status: 404 });

        const pos = state.positions[idx];
        const closeUnits = Number(body.units) || 0;
        if (closeUnits <= 0 || closeUnits >= pos.units) return NextResponse.json({ error: `Invalid units: ${closeUnits} (has ${pos.units})` }, { status: 400 });

        const exitPrice = Number(body.exit_price) || pos.entry_price;
        const rawPL = calcPL(pos.entry_price, exitPrice, closeUnits, pos.direction);
        const gbpUsd = Number(state.account?.gbp_usd) || 1.34;
        const plGbp = pos.currency === "GBP" ? rawPL : rawPL / gbpUsd;

        const closed = {
          id: `${ticker}-partial-${Date.now()}`, ticker, name: pos.name, direction: pos.direction || "buy",
          entry_price: pos.entry_price, exit_price: exitPrice, units: closeUnits,
          sleeve: pos.sleeve, entry_date: pos.entry_date, exit_date: new Date().toISOString(),
          net_pl: Math.round(plGbp * 100) / 100, reason: body.reason || "Partial close",
          exit_type: "partial", thesis: pos.thesis,
        };
        if (!state.closed) state.closed = [];
        state.closed.push(closed);
        state.positions[idx].units = Math.round((pos.units - closeUnits) * 100000) / 100000;
        state.account.total_realised_pl = Math.round(((state.account.total_realised_pl || 0) + plGbp) * 100) / 100;
        state.account.last_updated = new Date().toISOString();

        await logStrategy(state, `PARTIAL CLOSE ${ticker} ${closeUnits}u @ $${exitPrice} | P&L: ${plGbp >= 0 ? "+" : ""}£${plGbp.toFixed(2)}`);

        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "partial_close", closed, remaining: state.positions[idx].units });
      }

      case "move_stop": {
        const ticker = (body.ticker || body.id || "").toUpperCase();
        const idx = (state.positions || []).findIndex(p => p.id === ticker);
        if (idx < 0) return NextResponse.json({ error: `${ticker} not found` }, { status: 404 });
        const newStop = Number(body.stop);
        const oldStop = state.positions[idx].stop;
        const dir = (state.positions[idx].direction || "buy").toLowerCase();
        if (dir === "buy" && oldStop && newStop < oldStop) return NextResponse.json({ error: `R1: Cannot lower stop on LONG` }, { status: 400 });
        if (dir === "short" && oldStop && newStop > oldStop) return NextResponse.json({ error: `R1: Cannot raise stop on SHORT` }, { status: 400 });
        state.positions[idx].stop = newStop;
        if (body.trailing) state.positions[idx].trailing_stop = newStop;
        state.account.last_updated = new Date().toISOString();
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "move_stop", ticker, old_stop: oldStop, new_stop: newStop });
      }

      case "update_signals": {
        if (!state.signals) state.signals = { ...DEFAULT_STATE.signals };
        for (const [key, val] of Object.entries(body.signals || {})) { if (key in state.signals) state.signals[key] = val; }
        state.signals.total = (state.signals.s1_backchannel * state.signals.s1_weight) + (state.signals.s2_ais * state.signals.s2_weight) + (state.signals.s3_insurance * state.signals.s3_weight) + (state.signals.s4_trump_tone * state.signals.s4_weight) + (state.signals.s5_mediator * state.signals.s5_weight) + (state.signals.s6_brent_drop * state.signals.s6_weight);
        state.signals.last_updated = new Date().toISOString().slice(0, 10);
        if (body.notes) state.signals.notes = body.notes;
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "update_signals", signals: state.signals });
      }

      case "add_deposit": {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
        if (!state.deposits) state.deposits = [];
        state.deposits.push({ date: body.date || new Date().toISOString().slice(0, 10), amount });
        state.account.total_deposited = (state.account.total_deposited || 0) + amount;
        state.account.cash = (state.account.cash || 0) + amount;
        state.account.nav = (state.account.nav || 0) + amount;
        state.account.last_updated = new Date().toISOString();
        await logStrategy(state, `DEPOSIT £${amount} — NAV now £${state.account.nav.toFixed(2)}`);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "add_deposit", new_nav: state.account.nav });
      }

      case "store_knowledge": {
        let knowledge = await kvGet("apex:knowledge") || [];
        for (const f of (body.flags || [])) knowledge.push({ ...f, status: "fresh", stored_at: new Date().toISOString() });
        const now = Date.now();
        knowledge = knowledge.map(k => {
          const age = (now - new Date(k.stored_at || k.date).getTime()) / 86400000;
          return { ...k, status: age < 7 ? "fresh" : age < 30 ? "current" : "stale" };
        }).filter(k => k.status !== "stale").slice(-200);
        await kvSet("apex:knowledge", knowledge);
        return NextResponse.json({ ok: true, count: knowledge.length });
      }

      // ═══ STRATEGY MEMORY ═══
      case "add_strategy_note": {
        if (!state.strategy_log) state.strategy_log = [];
        state.strategy_log.push({
          date: new Date().toISOString(),
          note: body.note || "",
          category: body.category || "general",
          author: body.author || "PM",
        });
        if (state.strategy_log.length > 100) state.strategy_log = state.strategy_log.slice(-100);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "add_strategy_note" });
      }

      case "get_strategy_log": {
        return NextResponse.json({ log: state.strategy_log || [], count: (state.strategy_log || []).length });
      }

      // ═══ PIPELINE MANAGEMENT ═══
      case "remove_pipeline": {
        const ticker = (body.ticker || body.candidate || "").toUpperCase();
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        if (!state.pipeline) state.pipeline = [];
        const before = state.pipeline.length;
        state.pipeline = state.pipeline.filter(p => (p.candidate || "").toUpperCase() !== ticker);
        const removed = before - state.pipeline.length;
        if (removed === 0) return NextResponse.json({ error: `${ticker} not in pipeline`, pipeline: state.pipeline }, { status: 404 });
        await logStrategy(state, `REMOVED ${ticker} from pipeline`);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "remove_pipeline", removed, pipeline: state.pipeline });
      }

      case "clear_pipeline": {
        const before = (state.pipeline || []).length;
        state.pipeline = [];
        await logStrategy(state, `CLEARED pipeline (${before} entries removed)`);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "clear_pipeline", removed: before });
      }

      case "add_pipeline": {
        const candidate = (body.candidate || body.ticker || "").toUpperCase();
        if (!candidate) return NextResponse.json({ error: "Missing ticker/candidate" }, { status: 400 });
        if (!state.pipeline) state.pipeline = [];
        if (state.pipeline.some(p => (p.candidate || "").toUpperCase() === candidate)) {
          return NextResponse.json({ error: `${candidate} already in pipeline` }, { status: 400 });
        }
        const entry = {
          candidate,
          slot: body.slot || state.pipeline.length + 1,
          status: body.status || "watching",
          thesis: body.thesis || "",
          day: body.day || "",
          entry_trigger: body.entry_trigger || "",
        };
        state.pipeline.push(entry);
        await logStrategy(state, `ADDED ${candidate} to pipeline — ${entry.status}`);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "add_pipeline", entry });
      }

      // ═══ ACTIVE PIPELINE MANAGEMENT (user-approved opportunities ready to execute) ═══
      case "promote_to_active": {
        const candidate = (body.candidate || body.ticker || "").toUpperCase();
        if (!candidate) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        if (!state.active_pipeline) state.active_pipeline = [];
        if (state.active_pipeline.some(p => (p.candidate || "").toUpperCase() === candidate)) {
          return NextResponse.json({ error: `${candidate} already in active pipeline` }, { status: 400 });
        }
        const entry = {
          candidate,
          direction: body.direction || "buy",
          entry_price: Number(body.entry_price) || null,
          stop: Number(body.stop) || null,
          t1: Number(body.t1) || null,
          t2: Number(body.t2) || null,
          rr: Number(body.rr) || null,
          score: Number(body.score) || null,
          grade: body.grade || "",
          thesis: body.thesis || "",
          sleeve: body.sleeve || "B",
          // Setup metadata (passed through from scanner via UI promote button)
          suggested_units: body.suggested_units != null ? Number(body.suggested_units) : null,
          risk_gbp: body.risk_gbp != null ? Number(body.risk_gbp) : null,
          pct_nav_at_risk: body.pct_nav_at_risk != null ? Number(body.pct_nav_at_risk) : null,
          position_value_gbp: body.position_value_gbp != null ? Number(body.position_value_gbp) : null,
          sector: body.sector || "",
          theme: body.theme || "",
          mtf_aligned: body.mtf_aligned ?? null,
          entry_trigger: body.entry_trigger || "",
          ai_verdict: body.ai_verdict || "",
          days_to_earnings: body.days_to_earnings ?? null,
          promoted_at: new Date().toISOString(),
          source: body.source || "apex_scan",
        };
        state.active_pipeline.push(entry);
        await logStrategy(state, `PROMOTED ${candidate} to active pipeline — ${entry.direction.toUpperCase()} entry $${entry.entry_price} stop $${entry.stop} T1 $${entry.t1} (R:R ${entry.rr}:1)`);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "promote_to_active", entry });
      }

      case "remove_active": {
        const ticker = (body.ticker || body.candidate || "").toUpperCase();
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        if (!state.active_pipeline) state.active_pipeline = [];
        const before = state.active_pipeline.length;
        state.active_pipeline = state.active_pipeline.filter(p => (p.candidate || "").toUpperCase() !== ticker);
        const removed = before - state.active_pipeline.length;
        if (removed === 0) return NextResponse.json({ error: `${ticker} not in active pipeline`, active_pipeline: state.active_pipeline }, { status: 404 });
        await logStrategy(state, `REMOVED ${ticker} from active pipeline`);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "remove_active", removed, active_pipeline: state.active_pipeline });
      }

      case "clear_active": {
        const before = (state.active_pipeline || []).length;
        state.active_pipeline = [];
        await logStrategy(state, `CLEARED active pipeline (${before} entries)`);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "clear_active", removed: before });
      }

      case "dismiss_suggestion": {
        const ticker = (body.ticker || "").toUpperCase();
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        let dismissed = await kvGet("apex:dismissed") || { tickers: [], until: null };
        // 15 min window — matches scanner cron
        const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        if (!dismissed.tickers.includes(ticker)) dismissed.tickers.push(ticker);
        dismissed.until = until;
        await kvSet("apex:dismissed", dismissed);
        await logStrategy(state, `DISMISSED ${ticker} from APEX suggestions for 15min`);
        await kvSet("apex:state", state);
        return NextResponse.json({ ok: true, action: "dismiss_suggestion", ticker, until, dismissed_count: dismissed.tickers.length });
      }

      case "clear_dismissed": {
        await kvSet("apex:dismissed", { tickers: [], until: null });
        return NextResponse.json({ ok: true, action: "clear_dismissed" });
      }

      case "get_setup_tracker": {
        const tracker = await kvGet("apex:setup_tracker") || { suggestions: [] };
        const withOutcome = tracker.suggestions.filter(s => s.outcome);
        const wins = withOutcome.filter(s => s.outcome.hit_t1 || s.outcome.pl_gbp > 0);
        const losses = withOutcome.filter(s => !s.outcome.hit_t1 && s.outcome.pl_gbp <= 0);
        const totalPL = withOutcome.reduce((a, s) => a + (s.outcome.pl_gbp || 0), 0);
        const byGrade = {};
        for (const s of withOutcome) {
          const g = s.grade || "?";
          if (!byGrade[g]) byGrade[g] = { total: 0, wins: 0, avg_pl: 0, pl_sum: 0 };
          byGrade[g].total++;
          if (s.outcome.hit_t1 || s.outcome.pl_gbp > 0) byGrade[g].wins++;
          byGrade[g].pl_sum += s.outcome.pl_gbp || 0;
        }
        for (const g of Object.keys(byGrade)) {
          byGrade[g].win_rate = byGrade[g].total ? (byGrade[g].wins / byGrade[g].total * 100).toFixed(0) + "%" : "0%";
          byGrade[g].avg_pl = byGrade[g].total ? (byGrade[g].pl_sum / byGrade[g].total).toFixed(2) : "0";
        }
        return NextResponse.json({
          total_suggestions: tracker.suggestions.length,
          with_outcome: withOutcome.length,
          pending: tracker.suggestions.length - withOutcome.length,
          wins: wins.length,
          losses: losses.length,
          win_rate: withOutcome.length ? (wins.length / withOutcome.length * 100).toFixed(0) + "%" : "N/A",
          total_pl: totalPL.toFixed(2),
          by_grade: byGrade,
          recent: tracker.suggestions.slice(-20),
        });
      }

      case "update_active": {
        const ticker = (body.ticker || body.candidate || "").toUpperCase();
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        if (!state.active_pipeline) return NextResponse.json({ error: "No active pipeline" }, { status: 404 });
        const idx = state.active_pipeline.findIndex(p => (p.candidate || "").toUpperCase() === ticker);
        if (idx < 0) return NextResponse.json({ error: `${ticker} not in active pipeline` }, { status: 404 });
        const entry = state.active_pipeline[idx];

        // If no explicit values provided, auto-refresh from live scanner
        const hasExplicit = body.entry_price != null || body.stop != null || body.t1 != null || body.t2 != null;
        if (!hasExplicit) {
          try {
            // Prefer explicit BASE_URL (production), fallback to req origin
            const host = process.env.BASE_URL || (() => { try { return new URL(req.url).origin; } catch { return null; } })();
            if (!host) {
              entry.refresh_failed = true;
              entry.refresh_reason = "No BASE_URL configured";
            } else {
              const r = await fetch(`${host}/api/scanner?ticker=${ticker}`, {
                headers: { "x-apex-key": process.env.APEX_ACCESS_KEY },
                signal: AbortSignal.timeout(30000),
              });
              if (r.ok) {
                const d = await r.json();
                const opp = d.all?.[0];
                if (opp?.setup && !opp.setup.blocked) {
                  entry.entry_price = opp.setup.entry;
                  entry.stop = opp.setup.stop;
                  entry.t1 = opp.setup.t1;
                  entry.t2 = opp.setup.t2;
                  entry.rr = opp.setup.rr;
                  entry.direction = opp.setup.direction;
                  entry.live_price = opp.price;
                  entry.rsi = opp.rsi;
                  entry.score = opp.score;
                  entry.grade = opp.grade;
                  // Read from setup aliases (now matched to scanner output shape)
                  entry.suggested_units = opp.setup.suggested_units;
                  entry.risk_gbp = opp.setup.risk_gbp;
                  entry.pct_nav_at_risk = opp.setup.pct_nav_at_risk;
                  entry.position_value_gbp = opp.setup.position_value_gbp;
                  entry.sector = opp.setup.sector;
                  entry.theme = opp.setup.theme;
                  entry.correlation_warning = opp.correlation?.warning;
                  entry.mtf_aligned = opp.setup.mtf_aligned;
                  entry.days_to_earnings = opp.setup.days_to_earnings;
                  entry.refresh_confidence = opp.setup.confidence;
                  entry.thesis = opp.setup.thesis || opp.ai_judgment?.thesis || entry.thesis;
                  entry.entry_trigger = opp.setup.entry_trigger || "";
                  entry.ai_verdict = opp.ai_judgment?.verdict;
                  entry.setup_refreshed = true;
                  entry.refresh_failed = false;
                } else if (opp?.setup?.blocked) {
                  entry.refresh_failed = true;
                  entry.refresh_reason = opp.setup.block_reason || "Setup blocked";
                } else {
                  entry.refresh_failed = true;
                  entry.refresh_reason = opp ? "No valid setup (confidence too low or R:R fails)" : "Ticker not found in scanner";
                }
              } else {
                entry.refresh_failed = true;
                entry.refresh_reason = `Scanner returned ${r.status}`;
              }
            }
          } catch (e) {
            entry.refresh_failed = true;
            entry.refresh_reason = e.message;
          }
        } else {
          if (body.entry_price != null) entry.entry_price = Number(body.entry_price);
          if (body.stop != null) entry.stop = Number(body.stop);
          if (body.t1 != null) entry.t1 = Number(body.t1);
          if (body.t2 != null) entry.t2 = Number(body.t2);
          if (body.rr != null) entry.rr = Number(body.rr);
          if (body.sleeve != null) entry.sleeve = body.sleeve;
          if (body.thesis != null) entry.thesis = body.thesis;
        }

        state.active_pipeline[idx] = entry;
        entry.last_updated = new Date().toISOString();
        await logStrategy(state, `UPDATED active pipeline ${ticker}: entry $${entry.entry_price} stop $${entry.stop} T1 $${entry.t1}`);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "update_active", entry });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ═══ STRATEGY LOG HELPER ═══
async function logStrategy(state, note) {
  if (!state.strategy_log) state.strategy_log = [];
  state.strategy_log.push({
    date: new Date().toISOString(),
    note,
    category: "trade_action",
    author: "system",
  });
  if (state.strategy_log.length > 100) state.strategy_log = state.strategy_log.slice(-100);
}
