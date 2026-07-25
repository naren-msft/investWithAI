import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/agents";
import { fomcBundleFor } from "@/config/fomc";
import { parseScenario } from "@/config/fomc-scenarios";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scenario = parseScenario(url.searchParams.get("scenario"));
  try {
    const result = await runPipeline({ bundle: fomcBundleFor(scenario) });
    return NextResponse.json({ ...result, scenario });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "pipeline failed" }, { status: 500 });
  }
}
