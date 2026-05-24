import { NextResponse, type NextRequest } from "next/server";
import { runScreener } from "@/lib/screener";
import type { ScreenerMode } from "@/lib/screener/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const modeParam = req.nextUrl.searchParams.get("mode");
    const mode: ScreenerMode | undefined =
      modeParam === "gem" ? "gem" : modeParam === "classic" ? "classic" : undefined;
    const discoveryParam = req.nextUrl.searchParams.get("discovery");
    const discovery = discoveryParam === "on" ? true : discoveryParam === "off" ? false : undefined;
    const result = await runScreener({ mode, discovery });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "screener failed" },
      { status: 500 },
    );
  }
}
