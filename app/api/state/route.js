import { NextResponse } from "next/server";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { WATCHLIST } from "../../data/algoConfig.js";

export const maxDuration = 30;

// ═══ KV HELPERS ═══
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.result === null || d.result === undefined) return null;
    let val = d.result;
    for (let i = 0; i < 3; i++) {
      if (typeof val === "string") { try { val = JSON.parse(val); } catch { break; } } else break;
    }
    return val;
  } catch { return null; }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    const r = await fetch(`${url}/set/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    return r.ok;
  } catch { return false; }
}

// ═══ TICKER VALIDATION ═══
function validateTicker(ticker) {
  if (!ticker || typeof ticker !== "string") return { valid: false, error: "Missing ticker" };
  const upper = ticker.toUpperCase().trim();
  if (upper.length < 1 || upper.length > 10) return { valid: false, error: "Invalid ticker length" };
  // Check known tickers
  if (WATCHLIST[upper]) return { valid: true, ticker: upper };
  // Common typos
  const typos = { JMP: "JPM", MSOF: "MSFT", NVID: "NVDA", APPL: "AAPL" };
  if (typos[upper]) return { valid: true, ticker: typos[upper], corrected: true, original: upper };
  // Allow unknown tickers but warn
  return { valid: true, ticker: upper, unknown: true };
}

// ═══ DIRECTION-AWARE P&L ═══
function calcPL(entry, exit, units, direction) {
  const dir = (direction || "buy").toLowerCase();
  if (dir === "buy" || dir === "long") return (exit - entry) * units;
  if (dir === "sell" || dir === "short") return (entry - exit) * units;
  return (exit - entry) * units; // default to long
}

// ═══ GET — Load state ═══
export async function GET(req) {
  const authHeader = req.headers.get("x-apex-key");
  if (authHeader !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const state = await kvGet("apex:state");
  if (state) return NextResponse.json({ state, source: "kv" });
  return NextResponse.json({ state: DEFAULT_STATE, source: "default" });
}

// ═══ POST — Modify state ═══
export async function POST(req) {
  const authHeader = req.headers.get("x-apex-key");
  if (authHeader !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        // T212 Quick Sync — update NAV, cash, margin, health
        if (body.nav != null) state.account.nav = Number(body.nav);
        if (body.cash != null) state.account.cash = Number(body.cash);
        if (body.margin != null) state.account.margin_used = Number(body.margin);
        if (body.health != null) state.account.margin_health_pct = Number(body.health);
        if (body.gbp_usd != null) state.account.gbp_usd = Number(body.gbp_usd);
        state.account.last_updated = new Date().toISOString();
        // Update high water mark
        if (state.account.nav > (state.account.high_water_mark || 0)) {
          state.account.high_water_mark = state.account.nav;
        }
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "sync_account", account: state.account });
      }

      case "add_position": {
        const v = validateTicker(body.ticker || body.id);
        if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });
        if (v.corrected) {
          return NextResponse.json({
            error: `Ticker "${v.original}" not found. Did you mean "${v.ticker}"?`,
            suggestion: v.ticker,
          }, { status: 400 });
        }

        const pos = {
          id: v.ticker,
          name: body.name || WATCHLIST[v.ticker]?.name || v.ticker,
          sleeve: body.sleeve || "B",
          direction: (body.direction || "buy").toLowerCase(),
          units: Number(body.units) || 0,
          entry_price: Number(body.entry_price) || 0,
          entry_date: body.entry_date || new Date().toISOString(),
          currency: body.currency || "USD",
          stop: body.stop != null ? Number(body.stop) : null,
          trailing_stop: body.trailing_stop != null ? Number(body.trailing_stop) : null,
          t1: body.t1 != null ? Number(body.t1) : null,
          t2: body.t2 != null ? Number(body.t2) : null,
          kill_switch: body.kill_switch || "",
          peace_action: body.peace_action || "",
          thesis: body.thesis || "",
          conviction: Number(body.conviction) || 3,
          notes: body.notes || "",
        };

        if (!state.positions) state.positions = [];
        // Check for duplicate
        const existing = state.positions.findIndex(p => p.id === pos.id);
        if (existing >= 0) {
          return NextResponse.json({ error: `Position ${pos.id} already exists. Close it first or use partial_close.` }, { status: 400 });
        }

        state.positions.push(pos);
        state.account.last_updated = new Date().toISOString();
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "add_position", position: pos, warning: v.unknown ? `Ticker ${v.ticker} not in known watchlist` : undefined });
      }

      case "close_position": {
        const ticker = (body.ticker || body.id || "").toUpperCase();
        const idx = (state.positions || []).findIndex(p => p.id === ticker);
        if (idx < 0) return NextResponse.json({ error: `Position ${ticker} not found` }, { status: 404 });

        const pos = state.positions[idx];
        const exitPrice = Number(body.exit_price) || Number(pos.entry_price);
        const rawPL = calcPL(pos.entry_price, exitPrice, pos.units, pos.direction);
        const gbpUsd = Number(state.account?.gbp_usd) || 1.34;
        const plGbp = pos.currency === "GBP" ? rawPL : rawPL / gbpUsd;

        const closed = {
          id: `${ticker}-${Date.now()}`,
          ticker,
          name: pos.name,
          direction: pos.direction || "buy",
          entry_price: pos.entry_price,
          exit_price: exitPrice,
          units: pos.units,
          entry_date: pos.entry_date,
          exit_date: new Date().toISOString(),
          net_pl: Math.round(plGbp * 100) / 100,
          reason: body.reason || "Manual close",
          exit_type: body.exit_type || "manual",
        };

        if (!state.closed) state.closed = [];
        state.closed.push(closed);
        state.positions.splice(idx, 1);
        state.account.total_realised_pl = Math.round(((state.account.total_realised_pl || 0) + plGbp) * 100) / 100;
        state.account.last_updated = new Date().toISOString();

        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "close_position", closed });
      }

      case "partial_close": {
        const ticker = (body.ticker || body.id || "").toUpperCase();
        const idx = (state.positions || []).findIndex(p => p.id === ticker);
        if (idx < 0) return NextResponse.json({ error: `Position ${ticker} not found` }, { status: 404 });

        const pos = state.positions[idx];
        const closeUnits = Number(body.units) || 0;
        if (closeUnits <= 0 || closeUnits >= pos.units) {
          return NextResponse.json({ error: `Invalid partial close units: ${closeUnits} (position has ${pos.units})` }, { status: 400 });
        }

        const exitPrice = Number(body.exit_price) || pos.entry_price;
        const rawPL = calcPL(pos.entry_price, exitPrice, closeUnits, pos.direction);
        const gbpUsd = Number(state.account?.gbp_usd) || 1.34;
        const plGbp = pos.currency === "GBP" ? rawPL : rawPL / gbpUsd;

        const closed = {
          id: `${ticker}-partial-${Date.now()}`,
          ticker,
          name: pos.name,
          direction: pos.direction || "buy",
          entry_price: pos.entry_price,
          exit_price: exitPrice,
          units: closeUnits,
          entry_date: pos.entry_date,
          exit_date: new Date().toISOString(),
          net_pl: Math.round(plGbp * 100) / 100,
          reason: body.reason || "Partial close",
          exit_type: "partial",
        };

        if (!state.closed) state.closed = [];
        state.closed.push(closed);
        state.positions[idx].units = Math.round((pos.units - closeUnits) * 100000) / 100000;
        state.account.total_realised_pl = Math.round(((state.account.total_realised_pl || 0) + plGbp) * 100) / 100;
        state.account.last_updated = new Date().toISOString();

        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "partial_close", closed, remaining_units: state.positions[idx].units });
      }

      case "move_stop": {
        const ticker = (body.ticker || body.id || "").toUpperCase();
        const idx = (state.positions || []).findIndex(p => p.id === ticker);
        if (idx < 0) return NextResponse.json({ error: `Position ${ticker} not found` }, { status: 404 });

        const newStop = Number(body.stop);
        const oldStop = state.positions[idx].stop;

        // R1 check — never move stop against position
        const dir = (state.positions[idx].direction || "buy").toLowerCase();
        if (dir === "buy" || dir === "long") {
          if (oldStop && newStop < oldStop) {
            return NextResponse.json({ error: `R1 VIOLATION: Cannot move stop DOWN from $${oldStop} to $${newStop} on a LONG position` }, { status: 400 });
          }
        } else {
          if (oldStop && newStop > oldStop) {
            return NextResponse.json({ error: `R1 VIOLATION: Cannot move stop UP from $${oldStop} to $${newStop} on a SHORT position` }, { status: 400 });
          }
        }

        state.positions[idx].stop = newStop;
        if (body.trailing) state.positions[idx].trailing_stop = newStop;
        state.account.last_updated = new Date().toISOString();

        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "move_stop", ticker, old_stop: oldStop, new_stop: newStop });
      }

      case "update_signals": {
        if (!state.signals) state.signals = { ...DEFAULT_STATE.signals };
        for (const [key, val] of Object.entries(body.signals || {})) {
          if (key in state.signals) state.signals[key] = val;
        }
        // Recalculate total
        state.signals.total = (state.signals.s1_backchannel * state.signals.s1_weight) +
          (state.signals.s2_ais * state.signals.s2_weight) +
          (state.signals.s3_insurance * state.signals.s3_weight) +
          (state.signals.s4_trump_tone * state.signals.s4_weight) +
          (state.signals.s5_mediator * state.signals.s5_weight) +
          (state.signals.s6_brent_drop * state.signals.s6_weight);
        state.signals.last_updated = new Date().toISOString().slice(0, 10);
        if (body.notes) state.signals.notes = body.notes;

        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "update_signals", signals: state.signals });
      }

      case "add_memory": {
        if (!state.memory) state.memory = [];
        state.memory.push({
          date: new Date().toISOString().slice(0, 10),
          content: body.content || "",
          importance: Number(body.importance) || 3,
          source: body.source || "manual",
        });
        // Keep only last 50 memories
        if (state.memory.length > 50) state.memory = state.memory.slice(-50);
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "add_memory" });
      }

      case "add_deposit": {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid deposit amount" }, { status: 400 });
        if (!state.deposits) state.deposits = [];
        state.deposits.push({ date: body.date || new Date().toISOString().slice(0, 10), amount });
        state.account.total_deposited = (state.account.total_deposited || 0) + amount;
        state.account.cash = (state.account.cash || 0) + amount;
        state.account.nav = (state.account.nav || 0) + amount;
        state.account.last_updated = new Date().toISOString();
        const ok = await kvSet("apex:state", state);
        return NextResponse.json({ ok, action: "add_deposit", new_nav: state.account.nav });
      }

      case "store_knowledge": {
        // Store KNOWLEDGE_FLAG data
        const key = "apex:knowledge";
        let knowledge = await kvGet(key) || [];
        const flags = body.flags || [];
        for (const f of flags) {
          knowledge.push({ ...f, status: "fresh", stored_at: new Date().toISOString() });
        }
        // Keep last 200 entries, age status
        const now = Date.now();
        knowledge = knowledge.map(k => {
          const age = (now - new Date(k.stored_at || k.date).getTime()) / 86400000;
          return { ...k, status: age < 7 ? "fresh" : age < 30 ? "current" : "stale" };
        }).filter(k => k.status !== "stale").slice(-200);
        await kvSet(key, knowledge);
        return NextResponse.json({ ok: true, action: "store_knowledge", count: knowledge.length });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("State error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
