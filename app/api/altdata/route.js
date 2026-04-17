import { NextResponse } from "next/server";
import {
  fetchTrumpStatements, analyzeTrumpTone,
  fetchHormuzActivity, fetchInsuranceSignal,
  fetchOptionsFlow, computePeaceSignal,
} from "../../lib/altDataMonitor.js";

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try { const r = await fetch(`${url}/set/${key}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) }); return r.ok; } catch { return false; }
}

export const maxDuration = 60;

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const source = url.searchParams.get("source") || "all";
  const ticker = url.searchParams.get("ticker");

  try {
    switch (source) {
      case "trump": {
        const statements = await fetchTrumpStatements();
        const analysis = analyzeTrumpTone(statements);
        return NextResponse.json({ statements: statements.slice(0, 10), analysis });
      }

      case "hormuz": {
        const data = await fetchHormuzActivity();
        return NextResponse.json({ hormuz: data });
      }

      case "insurance": {
        const data = await fetchInsuranceSignal();
        return NextResponse.json({ insurance: data });
      }

      case "options": {
        if (!ticker) return NextResponse.json({ error: "Missing ticker for options query" }, { status: 400 });
        const data = await fetchOptionsFlow(ticker);
        return NextResponse.json({ options: data });
      }

      case "peace_signal": {
        const peaceSignal = await computePeaceSignal();
        await kvSet("apex:peace_signal", peaceSignal);
        return NextResponse.json({ peace_signal: peaceSignal });
      }

      case "all":
      default: {
        const peaceSignal = await computePeaceSignal();
        await kvSet("apex:peace_signal", peaceSignal);
        return NextResponse.json({ peace_signal: peaceSignal });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
