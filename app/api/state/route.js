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
  const state = await kvGet("apex:state");
  if (state) return NextResponse.json({ state, source: "kv" });
  return NextResponse.json({ state: DEFAULT_STATE, source: "default" });
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
