import { NextResponse } from "next/server";
import { readSnapshots, diffSnapshots } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wantDiff = searchParams.get("diff") === "1";
  const limit = Math.max(1, Math.min(2000, Number(searchParams.get("limit") ?? "200")));
  const all = await readSnapshots();
  const recent = all.slice(-limit);

  if (wantDiff) {
    if (all.length < 2) return NextResponse.json({ snapshots: recent, diff: null });
    const current = all[all.length - 1];
    const previous = all[all.length - 2];
    return NextResponse.json({
      snapshots: recent,
      diff: diffSnapshots(current, previous),
    });
  }
  return NextResponse.json({ snapshots: recent });
}
