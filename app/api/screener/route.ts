import { NextResponse } from "next/server";
import { runScreener } from "@/lib/screener";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const result = await runScreener();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "screener failed" },
      { status: 500 },
    );
  }
}
