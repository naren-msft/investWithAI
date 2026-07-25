import { NextResponse } from "next/server";
import { appendExecution, readExecutions } from "@/lib/store";
import { phaseCap } from "@/lib/phaseCap";
import { FOMC_UNIVERSE } from "@/config/fomc-scenarios";
import { FOMC_TRANCHES, buildFomcTranches, FOMC_DEFAULT_CASH_BUFFER } from "@/config/fomc";
import type { Tranche } from "@/types";

export const dynamic = "force-dynamic";

const ALLOWED: Set<string> = new Set(FOMC_UNIVERSE.map((t) => t.ticker));

// Lightweight phase-gate check for the API path. evaluatePhaseGates() in
// lib/phaseGate.ts needs SPY candles + regime to handle drawdown/trend
// triggers — the FOMC config uses only `afterIso` and `daysFromStart`, so we
// can validate those locally without dragging in the full pipeline. If the
// FOMC tranche schema gains spyDrawdown/trendConfirmation gates later, this
// must be upgraded to the full evaluator.
function isPhaseUnlocked(tr: Tranche, firstExecDateIso: string | null): { ok: boolean; reason: string } {
  const trig = tr.triggers ?? {};
  const now = Date.now();
  if (typeof trig.afterIso === "string") {
    const t = Date.parse(trig.afterIso);
    if (Number.isFinite(t) && now < t) {
      const label = trig.afterIsoLabel ?? trig.afterIso;
      return { ok: false, reason: `Phase ${tr.phase} is locked until ${label}.` };
    }
  }
  if (typeof trig.daysFromStart === "number" && trig.daysFromStart > 0) {
    if (!firstExecDateIso) {
      return { ok: false, reason: `Phase ${tr.phase} unlocks ${trig.daysFromStart}d after the first execution. No executions logged yet.` };
    }
    const start = Date.parse(firstExecDateIso);
    const days = Math.floor((now - start) / 86_400_000);
    if (days < trig.daysFromStart) {
      return { ok: false, reason: `Phase ${tr.phase} unlocks ${trig.daysFromStart - days}d from now (needs ${trig.daysFromStart}d since first execution).` };
    }
  }
  if (trig.trendConfirmation) {
    // Pessimistic default: require explicit override for trend-gated phases at the API layer.
    return { ok: false, reason: `Phase ${tr.phase} requires trend confirmation — review the dashboard before logging fills here.` };
  }
  return { ok: true, reason: "" };
}

export async function GET() {
  const executions = await readExecutions("fomc");
  const cap = phaseCap(FOMC_TRANCHES, executions);
  return NextResponse.json({ executions, phaseCap: cap });
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ticker = String(body?.ticker ?? "").toUpperCase().trim();
  const shares = Number(body?.shares);
  const price  = Number(body?.price);
  const date   = String(body?.date ?? new Date().toISOString().slice(0, 10));
  const fees   = Number.isFinite(Number(body?.fees)) ? Math.max(0, Number(body.fees)) : 0;
  const sideRaw = String(body?.side ?? "buy").toLowerCase();
  const side   = sideRaw === "sell" ? "sell" as const : "buy" as const;

  // Note carries scenario-at-fill + phase tag in the format "[scn:hold|phase:1] <free text>"
  // — back-compat with /stocks /etf logs because store.ts treats `note` as opaque.
  const scenario = body?.scenario ? String(body.scenario).toLowerCase().slice(0, 12) : "";
  const phase    = body?.phase ? Number(body.phase) : NaN;
  const baseNote = body?.note ? String(body.note).slice(0, 200) : "";
  const tagPrefix =
    (scenario ? `[scn:${scenario}]` : "") +
    (Number.isFinite(phase) && phase > 0 ? `[phase:${phase}]` : "");
  const note = (tagPrefix + (baseNote ? ` ${baseNote}` : "")) || undefined;

  const override = body?.override === true;

  // M13 — caller can pass capital to scale tranche caps; falls back to default.
  const capitalRaw = Number(body?.capital);
  const capital = Number.isFinite(capitalRaw) && capitalRaw > 0 ? capitalRaw : null;
  const tranches: readonly Tranche[] = capital
    ? buildFomcTranches(capital, FOMC_DEFAULT_CASH_BUFFER)
    : FOMC_TRANCHES;

  if (!ALLOWED.has(ticker)) return NextResponse.json({ error: `ticker not in FOMC universe: ${ticker}` }, { status: 400 });
  if (!Number.isFinite(shares) || shares <= 0) return NextResponse.json({ error: "shares must be > 0" }, { status: 400 });
  if (!Number.isFinite(price) || price <= 0)   return NextResponse.json({ error: "price must be > 0" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))       return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  const execs = await readExecutions("fomc");
  const cap = phaseCap(tranches, execs);
  const cost = shares * price;

  // Sells don't consume phase budget; they return cash — skip the gate.
  if (side === "buy" && !override) {
    // M12: phase-gate check first (timing), then dollar-cap (size).
    const targetPhase = tranches.find((t) => t.phase === cap.phase) ?? tranches[0];
    const firstExecDate = execs.length > 0 ? execs.map((e) => e.date).sort()[0] : null;
    const gate = isPhaseUnlocked(targetPhase, firstExecDate);
    if (!gate.ok) {
      return NextResponse.json({
        error: `${gate.reason} Set override=true to log a fill anyway (e.g. backfilling a real broker trade).`,
        phaseCap: cap,
        cost,
      }, { status: 422 });
    }
    if (cost > cap.remainingInPhase + 0.01) {
      return NextResponse.json({
        error: `Phase ${cap.phase} cap exceeded: this buy is $${cost.toFixed(2)} but only $${cap.remainingInPhase.toFixed(2)} remains in the phase. Wait for the next phase, reduce shares, or check "Override phase cap" to proceed anyway.`,
        phaseCap: cap,
        cost,
      }, { status: 422 });
    }
  }

  const execution = await appendExecution({ ticker, shares, price, date, note, side, fees }, "fomc");
  return NextResponse.json({ execution });
}
