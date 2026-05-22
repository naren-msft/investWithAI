import { NextResponse } from "next/server";
import { TARGETS } from "@/config/portfolio";
import { computeOverlap } from "@/lib/overlap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await computeOverlap(TARGETS as any);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "overlap failed" }, { status: 500 });
  }
}
