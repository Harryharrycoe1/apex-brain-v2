// APEX BRAIN V5.2 — AUDIT LOG VIEWER ENDPOINT
// GET /api/audit
// Returns recent audit entries with optional filtering.
// Query params: entity, actor, action, since, limit

import { NextResponse } from "next/server";
import { auditRead } from "../../lib/auditLog.js";

export const maxDuration = 10;

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const opts = {
      limit: Number(url.searchParams.get("limit")) || 100,
      entity: url.searchParams.get("entity") || undefined,
      actor: url.searchParams.get("actor") || undefined,
      action: url.searchParams.get("action") || undefined,
      since: url.searchParams.get("since") || undefined,
    };
    const entries = await auditRead(opts);
    return NextResponse.json({
      ok: true,
      count: entries.length,
      filters_applied: opts,
      entries,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
