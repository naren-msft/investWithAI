import { NextResponse } from "next/server";
import { appendExecution, readExecutions } from "@/lib/store";
import { phaseCap } from "@/lib/phaseCap";
import { STOCK_TARGETS, STOCK_TRANCHES } from "@/config/stocks";

export const dynamic = "force-dynamic";

const ALLOWED: Set<string> = new Set(STOCK_TARGETS.map((t) => t.ticker as string));

export async function GET() {
  const executions = await readExecutions("stocks");
  const cap = phaseCap(STOCK_TRANCHES, executions);
  return NextResponse.json({ executions, phaseCap: cap });
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ticker = String(body?.ticker ?? "").toUpperCase().trim();
  const shares = Number(body?.shares);
  const price  = Number(body?.price);
  const date   = String(body?.date ?? new Date().toISOString().slice(0, 10));
  const note   = body?.note ? String(body.note).slice(0, 200) : undefined;
  const override = body?.override === true;

  if (!ALLOWED.has(ticker)) return NextResponse.json({ error: `ticker not in stock universe: ${ticker}` }, { status: 400 });
  if (!Number.isFinite(shares) || shares <= 0) return NextResponse.json({ error: "shares must be > 0" }, { status: 400 });
  if (!Number.isFinite(price) || price <= 0)   return NextResponse.json({ error: "price must be > 0" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))       return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  const cost = shares * price;
  if (!override) {
    const execs = await readExecutions("stocks");
    const cap = phaseCap(STOCK_TRANCHES, execs);
    if (cost > cap.remainingInPhase + 0.01) {
      return NextResponse.json({
        error: `Phase ${cap.phase} cap exceeded: this buy is $${cost.toFixed(2)} but only $${cap.remainingInPhase.toFixed(2)} remains in the phase. Wait for the next phase, reduce shares, or check "Override phase cap" to proceed anyway.`,
        phaseCap: cap,
        cost,
      }, { status: 422 });
    }
  }

  const execution = await appendExecution({ ticker, shares, price, date, note }, "stocks");
  return NextResponse.json({ execution });
}
