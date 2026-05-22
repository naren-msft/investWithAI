import { NextResponse } from "next/server";
import { getQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!symbols.length) return NextResponse.json({ error: "symbols required" }, { status: 400 });
  try {
    const data = await getQuotes(symbols);
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}
