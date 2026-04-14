import { NextResponse } from "next/server";

export const maxDuration = 60;

// Quant engine stub — full ML/backtest/factors/Monte Carlo to be added
export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ status: "quant_ready", message: "Full quant engine pending deployment" });
}
