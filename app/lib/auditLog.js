// APEX BRAIN V5.2 — AUDIT LOG
//
// Central mutation logging for full audit trail. Every state mutation that matters
// writes an entry here before the state is persisted.
//
// Entries are stored at KV key "apex:audit_log" as an array of at most 500 entries.
// Older entries evict FIFO. For long-term retention, export periodically to flat file.
//
// Entry schema:
//   {
//     id:        unique hex id
//     ts:        ISO timestamp
//     actor:     "user" | "system" | "worker" | "cron"
//     action:    short verb (e.g. "open_position", "edit_stop", "trail_advance")
//     entity:    ticker or fund-level identifier (e.g. "CVX", "fund")
//     before:    snapshot of mutated fields BEFORE (optional, only if changed)
//     after:     snapshot of mutated fields AFTER
//     reason:    human-readable explanation, ideally machine-parseable
//     meta:      extra context (rule_violations[], override_reason, etc.)
//   }

const AUDIT_KEY = "apex:audit_log";
const AUDIT_MAX = 500;

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = await r.json();
    let v = d.result;
    for (let i = 0; i < 3; i++) {
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break;
    }
    return v;
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

function newId() {
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
}

/**
 * Write an audit entry. Fire-and-log on failure — never throw.
 * @param {Object} entry - audit record (fields above)
 * @returns {Promise<Object>} the written entry (with id + ts) or null on failure
 */
export async function auditWrite(entry) {
  try {
    const record = {
      id: newId(),
      ts: new Date().toISOString(),
      actor: entry.actor || "system",
      action: entry.action || "unknown",
      entity: entry.entity || "unknown",
      before: entry.before || null,
      after: entry.after || null,
      reason: entry.reason || "",
      meta: entry.meta || {},
    };
    const log = (await kvGet(AUDIT_KEY)) || [];
    log.push(record);
    if (log.length > AUDIT_MAX) log.splice(0, log.length - AUDIT_MAX);
    await kvSet(AUDIT_KEY, log);
    return record;
  } catch (e) {
    console.error("[audit] write failed:", e.message);
    return null;
  }
}

/**
 * Read recent audit entries with optional filtering.
 * @param {Object} opts
 * @param {number} opts.limit - default 50
 * @param {string} opts.entity - filter by entity
 * @param {string} opts.actor  - filter by actor
 * @param {string} opts.action - filter by action
 * @param {string} opts.since  - ISO, only entries after this
 * @returns {Promise<Array>}
 */
export async function auditRead(opts = {}) {
  try {
    const log = (await kvGet(AUDIT_KEY)) || [];
    let filtered = log;
    if (opts.entity) filtered = filtered.filter(e => e.entity === opts.entity);
    if (opts.actor) filtered = filtered.filter(e => e.actor === opts.actor);
    if (opts.action) filtered = filtered.filter(e => e.action === opts.action);
    if (opts.since) filtered = filtered.filter(e => e.ts >= opts.since);
    const limit = opts.limit || 50;
    return filtered.slice(-limit).reverse();
  } catch (e) {
    console.error("[audit] read failed:", e.message);
    return [];
  }
}

/**
 * Compute the delta between two objects, returning only changed keys.
 * Useful for before/after snapshots without bloating the log.
 */
export function computeDelta(before, after) {
  if (!before || !after) return { before: before || null, after: after || null };
  const b = {}, a = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (before[k] !== after[k]) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return Object.keys(b).length > 0 ? { before: b, after: a } : null;
}

/**
 * Helper to log a rule violation that was overridden by user.
 */
export async function auditRuleOverride(rule, entity, reason, meta = {}) {
  return auditWrite({
    actor: "user",
    action: "rule_override",
    entity,
    after: null,
    reason: `${rule} OVERRIDDEN: ${reason}`,
    meta: { rule, ...meta },
  });
}
