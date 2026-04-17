import { NextResponse } from "next/server";
import { initLearningState, recordOutcome, getLearningSummary, scoreWithLearning } from "../../lib/adaptiveLearning.js";

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

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const learningState = await kvGet("apex:learning") || initLearningState();
  const summary = getLearningSummary(learningState);
  return NextResponse.json({ summary, full_state: learningState });
}

export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { action, trade, signals } = body;
    let learningState = await kvGet("apex:learning") || initLearningState();

    switch (action) {
      case "record_outcome": {
        if (!trade || !signals) return NextResponse.json({ error: "Missing trade or signals" }, { status: 400 });
        learningState = recordOutcome(learningState, trade, signals);
        await kvSet("apex:learning", learningState);
        return NextResponse.json({ success: true, summary: getLearningSummary(learningState) });
      }

      case "score": {
        if (!signals) return NextResponse.json({ error: "Missing signals" }, { status: 400 });
        const score = scoreWithLearning(signals, learningState);
        return NextResponse.json({ score });
      }

      case "rebuild_from_closed": {
        // Replay all closed trades through the learning loop
        const state = await kvGet("apex:state") || {};
        const closed = state.closed || [];
        learningState = initLearningState();

        for (const trade of closed) {
          // Synthesize signals from trade metadata if not present
          const signals = trade.signals_at_entry || {
            momentum: 0.5,
            regime_fit: 0.6,
            trend_following: 0.5,
          };
          learningState = recordOutcome(learningState, trade, signals);
        }

        await kvSet("apex:learning", learningState);
        return NextResponse.json({
          success: true,
          rebuilt_from: closed.length,
          summary: getLearningSummary(learningState)
        });
      }

      case "reset": {
        learningState = initLearningState();
        await kvSet("apex:learning", learningState);
        return NextResponse.json({ success: true, message: "Learning state reset" });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
