import { NextResponse } from "next/server";
import { readHysteresis } from "@/lib/regimeHysteresis";

export const dynamic = "force-dynamic";

const MULTIPLIERS: Record<string, number> = {
  rally: 0.7,
  neutral: 1.0,
  pullback: 1.2,
  correction: 1.5,
};

// Lightweight regime endpoint — just reads the persisted hysteresis state
// without re-running the full pipeline. Used by the home page market pulse.
export async function GET() {
  try {
    const s = await readHysteresis();
    const kind = s.currentRegime || "neutral";
    return NextResponse.json({
      kind,
      multiplier: MULTIPLIERS[kind] ?? 1.0,
      pendingKind: s.pendingRegime,
      pendingDays: s.pendingDays,
      lastUpdatedDate: s.lastUpdatedDate,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "regime failed" }, { status: 500 });
  }
}
