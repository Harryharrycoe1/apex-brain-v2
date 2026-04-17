import { NextResponse } from "next/server";
import { selectStrategies, findPairsTrade, findCrossAssetHedge, screenEarningsDrift, STRATEGIES } from "../../lib/strategyEngine.js";

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}

export const maxDuration = 30;

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Fetch state, regime, and scanner results
    const [state, regime, scannerData] = await Promise.all([
      kvGet("apex:state"),
      kvGet("apex:regime"),
      // Fetch scanner inline by hitting our own API
      fetch(new URL("/api/scanner", req.url), {
        headers: { "x-apex-key": process.env.APEX_ACCESS_KEY },
      }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const positions = state?.positions || [];
    const regimeCode = regime?.primary_code || "REFLATION";
    const scannerResults = scannerData?.all || [];
    const earningsCalendar = state?.earnings_calendar || [];

    const recommendations = selectStrategies(regimeCode, scannerResults, positions, earningsCalendar);

    return NextResponse.json({
      ...recommendations,
      regime_full: regime?.primary_regime,
      strategies_available: Object.keys(STRATEGIES).length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { action, sector, regime } = body;

    switch (action) {
      case "find_pair": {
        const scannerData = await fetch(new URL("/api/scanner", req.url), {
          headers: { "x-apex-key": process.env.APEX_ACCESS_KEY },
        }).then(r => r.json());
        const pair = findPairsTrade(scannerData?.all || [], sector || "Technology");
        return NextResponse.json({ pair });
      }

      case "find_hedge": {
        const hedge = findCrossAssetHedge(regime || "REFLATION");
        return NextResponse.json({ hedge });
      }

      case "earnings_drift": {
        const state = await kvGet("apex:state") || {};
        const drift = screenEarningsDrift(state.positions || [], state.earnings_calendar || []);
        return NextResponse.json({ candidates: drift });
      }

      case "list_strategies": {
        return NextResponse.json({ strategies: STRATEGIES });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
