// APEX BRAIN V5.2 — RULE STATUS ENDPOINT
// GET /api/rules — returns current fund-level rule status + drawdown + monthly PL
// Used by UI banner to show real-time risk state (NORMAL / ELEVATED / HALT)

import { NextResponse } from "next/server";
import { fundRuleStatus, computeDrawdown, computeMonthlyPL } from "../../lib/ruleEngine.js";
import { DEFAULT_STATE } from "../../data/fundState.js";

export const maxDuration = 10;

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

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await kvGet("apex:state") || DEFAULT_STATE;
    const status = fundRuleStatus(state);
    return NextResponse.json({
      ok: true,
      ...status,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
