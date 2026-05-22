import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const result = await runPipeline();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "pipeline failed" }, { status: 500 });
  }
}
