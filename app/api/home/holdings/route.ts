import { NextResponse } from "next/server";
import { TARGETS } from "@/config/portfolio";
import { STOCK_TARGETS } from "@/config/stocks";

export const dynamic = "force-static";

export interface HoldingEntry {
  ticker: string;
  name: string;
  role: string;
  kind: "etf" | "stocks";
  href: string;
}

export async function GET() {
  const etf: HoldingEntry[] = TARGETS.map((t) => ({
    ticker: t.ticker,
    name: t.name,
    role: t.role,
    kind: "etf",
    href: `/etf/${t.ticker}`,
  }));
  const stocks: HoldingEntry[] = STOCK_TARGETS.map((t) => ({
    ticker: t.ticker,
    name: t.name,
    role: t.role,
    kind: "stocks",
    href: `/stocks/${t.ticker}`,
  }));
  return NextResponse.json({ entries: [...etf, ...stocks] });
}
