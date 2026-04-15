import { NextResponse } from "next/server";

export const maxDuration = 30;
const API_KEY = process.env.ANTHROPIC_API_KEY;

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

export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ═══ M1: SESSION MEMORY ═══
      case "generate_memory": {
        const { messages } = body;
        if (!messages?.length) return NextResponse.json({ ok: false, error: "No messages" });

        // Use Haiku for cheap summarization
        const summary = messages.slice(-10).map(m => `${m.role}: ${(m.content || "").slice(0, 200)}`).join("\n");
        try {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 200,
              messages: [{ role: "user", content: `Summarize this trading session in 1-2 sentences. Focus on decisions made, positions discussed, and key intelligence:\n\n${summary}` }],
            }),
          });
          const d = await r.json();
          const memText = d.content?.[0]?.text || "Session recorded";

          let memories = await kvGet("apex:memories") || [];
          memories.push({
            date: new Date().toISOString().slice(0, 10),
            content: memText,
            importance: body.importance || 3,
            source: "session",
          });
          if (memories.length > 50) memories = memories.slice(-50);
          await kvSet("apex:memories", memories);

          return NextResponse.json({ ok: true, memory: memText });
        } catch (e) {
          return NextResponse.json({ ok: false, error: e.message });
        }
      }

      // ═══ M2: OUTCOME TRACKING ═══
      case "record_outcome": {
        const { trade_id, prediction, actual_result } = body;
        let outcomes = await kvGet("apex:outcomes") || [];
        outcomes.push({
          trade_id,
          prediction,
          actual: actual_result,
          correct: prediction === actual_result,
          date: new Date().toISOString().slice(0, 10),
        });
        if (outcomes.length > 200) outcomes = outcomes.slice(-200);
        await kvSet("apex:outcomes", outcomes);

        const correct = outcomes.filter(o => o.correct).length;
        const accuracy = outcomes.length ? (correct / outcomes.length * 100).toFixed(1) : 0;

        return NextResponse.json({ ok: true, total_outcomes: outcomes.length, accuracy });
      }

      // ═══ M3: PATHWAY SCORING ═══
      case "score_pathway": {
        const { pathway, score, followed_up } = body;
        let scores = await kvGet("apex:pathway_scores") || {};
        if (!scores[pathway]) scores[pathway] = { total: 0, sum: 0, followups: 0 };
        scores[pathway].total++;
        scores[pathway].sum += (score || 3);
        if (followed_up) scores[pathway].followups++;

        await kvSet("apex:pathway_scores", scores);
        return NextResponse.json({ ok: true, pathway, avg_score: (scores[pathway].sum / scores[pathway].total).toFixed(1) });
      }

      // ═══ M4: GET ANALYTICS ═══
      case "get_analytics": {
        const state = await kvGet("apex:state");
        const knowledge = await kvGet("apex:knowledge") || [];
        const outcomes = await kvGet("apex:outcomes") || [];
        const pathwayScores = await kvGet("apex:pathway_scores") || {};
        const memories = await kvGet("apex:memories") || [];
        const closed = state?.closed || [];

        // Compute trade analytics
        const wins = closed.filter(t => t.net_pl > 0);
        const losses = closed.filter(t => t.net_pl <= 0);
        const mechanical = closed.filter(t => t.exit_type === "stop" || t.exit_type === "tp");

        // By sleeve
        const bySleeve = {};
        for (const t of closed) {
          const s = t.sleeve || "unknown";
          if (!bySleeve[s]) bySleeve[s] = { wins: 0, losses: 0, total_pl: 0 };
          if (t.net_pl > 0) bySleeve[s].wins++;
          else bySleeve[s].losses++;
          bySleeve[s].total_pl = Math.round((bySleeve[s].total_pl + (t.net_pl || 0)) * 100) / 100;
        }

        // Avg hold days
        const holdDays = closed.map(t => {
          if (!t.entry_date || !t.exit_date) return null;
          return Math.ceil((new Date(t.exit_date) - new Date(t.entry_date)) / 86400000);
        }).filter(d => d != null);

        const analytics = {
          total_trades: closed.length,
          win_rate: closed.length ? (wins.length / closed.length * 100).toFixed(1) : 0,
          avg_winner_gbp: wins.length ? (wins.reduce((a, t) => a + t.net_pl, 0) / wins.length).toFixed(2) : 0,
          avg_loser_gbp: losses.length ? (losses.reduce((a, t) => a + t.net_pl, 0) / losses.length).toFixed(2) : 0,
          realised_rr: losses.length && wins.length ? Math.abs(wins.reduce((a, t) => a + t.net_pl, 0) / wins.length / (losses.reduce((a, t) => a + t.net_pl, 0) / losses.length)).toFixed(1) : "N/A",
          mechanical_exit_pct: closed.length ? (mechanical.length / closed.length * 100).toFixed(0) : 0,
          by_sleeve: bySleeve,
          avg_hold_days: holdDays.length ? (holdDays.reduce((a, b) => a + b, 0) / holdDays.length).toFixed(0) : "N/A",
          prediction_accuracy: outcomes.length ? (outcomes.filter(o => o.correct).length / outcomes.length * 100).toFixed(1) : "N/A",
        };

        // Fresh knowledge
        const now = Date.now();
        const freshKnowledge = knowledge.filter(k => {
          const age = (now - new Date(k.stored_at || k.date).getTime()) / 86400000;
          return age < 30;
        }).map(k => {
          const age = (now - new Date(k.stored_at || k.date).getTime()) / 86400000;
          return { ...k, status: age < 7 ? "fresh" : "current" };
        });

        return NextResponse.json({
          analytics,
          knowledge: freshKnowledge,
          pathway_scores: pathwayScores,
          memories: memories.slice(-5),
          outcomes_count: outcomes.length,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("Learn error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
