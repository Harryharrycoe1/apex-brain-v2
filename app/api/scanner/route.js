import { NextResponse } from "next/server";

export const maxDuration = 60;

// Scanner stub — full 29-module scanner to be added
// For now, returns a basic scan of held positions
export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ status: "scanner_ready", message: "Full scanner module pending deployment", scanned: 0 });
}

export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ status: "scanner_ready", message: "Full 29-module scanner pending deployment" });
}
