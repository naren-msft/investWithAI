import type { PortfolioConfig, TargetWeight, Tranche } from "@/types";
import type { PortfolioBundle, SleeveCap } from "./bundle";
import {
  FOMC_DECISION_AT_ISO,
  NVDA_EARNINGS_AT_ISO,
} from "@/lib/marketTime";
import {
  FOMC_UNIVERSE,
  FOMC_SCENARIOS,
  FOMC_SLEEVE_LABEL,
  FOMC_ROLE_TO_SLEEVE,
  FOMC_SLEEVE_CAPS,
  buildFomcTargets,
  type FomcScenarioId,
} from "./fomc-scenarios";

// =============================================================================
// FOMC June-17 deployment bundle.
//
// Capital + 5-phase tranche schedule from the v4 PDF playbook:
//   $700K total cash to deploy
//   Phase 1 (NOW → June 16, pre-FOMC):  $280K (40%) — neutral half-sized cores
//   Phase 2 (June 18 → July 15):        $210K (30%) — pivot to scenario column
//   Phase 3 (~Aug 27 NVDA earnings):    $140K (20%) — add on beats, trim runners
//   Phase 4 (Sep → Dec reserve):         $70K (10%) — hold for pullback
//   Phase 5 (cash buffer release):        $0       — releases on trend confirmation
//
// Gates are EVENT-anchored where it matters (P2 = post-FOMC, P3 = NVDA print)
// and elapsed-days where it's seasonal (P4, P5). Calendar dates take priority
// over first-execution drift so the engine pivots on June 17 even if you have
// not deployed anything yet.
// =============================================================================

// Cash buffer is 0 — the FOMC playbook does NOT model cash as a target.
// Dry powder is held by phasing the deployment across 5 tranches; if you
// want to keep a hard reserve, set FOMC_CASH_BUFFER as an env override.
export const FOMC_DEFAULT_CAPITAL    = Number(process.env.FOMC_CAPITAL      ?? 700_000);
export const FOMC_DEFAULT_CASH_BUFFER = Number(process.env.FOMC_CASH_BUFFER ?? 0);

// Tranche fractions: 40 / 30 / 20 / 10 (Phase 4 absorbs rounding).
const TRANCHE_FRACTIONS = [0.40, 0.30, 0.20] as const;

export function buildFomcTranches(capital: number, cashBuffer: number): Tranche[] {
  const deployable = Math.max(0, capital - cashBuffer);
  const p1 = Math.round(deployable * TRANCHE_FRACTIONS[0]);
  const p2 = Math.round(deployable * TRANCHE_FRACTIONS[1]);
  const p3 = Math.round(deployable * TRANCHE_FRACTIONS[2]);
  const p4 = Math.max(0, deployable - (p1 + p2 + p3));
  return [
    {
      phase: 1,
      size: p1,
      gate: "Pre-FOMC build — deploy IMMEDIATELY (now → June 16, 2026). Neutral half-sized Tier-1 cores.",
      triggers: { daysFromStart: 0 },
      status: "ready",
    },
    {
      phase: 2,
      size: p2,
      gate: "Post-FOMC pivot — unlocks immediately after the June 17 2026 2:00 PM ET decision. Pivot weights to the scenario the Fed actually delivered.",
      triggers: { afterIso: FOMC_DECISION_AT_ISO, afterIsoLabel: "FOMC Jun-17 2026 2pm ET" },
      status: "locked",
    },
    {
      phase: 3,
      size: p3,
      gate: "Earnings season — unlocks after NVDA late-Aug 2026 print. Add to Tier-1 beats; trim Tier-3 winners.",
      triggers: { afterIso: NVDA_EARNINGS_AT_ISO, afterIsoLabel: "NVDA Aug-2026 earnings" },
      status: "locked",
    },
    {
      phase: 4,
      size: p4,
      gate: "Reserve — unlocks 120 days after Phase 1 anchor (Sep-Dec). Hold for ≥10% correction; otherwise DCA into Tier-1.",
      triggers: { daysFromStart: 120 },
      status: "locked",
    },
    {
      phase: 5,
      size: cashBuffer,
      gate: "Cash buffer release — requires trend confirmation (5%+ pullback then back to rally) OR 180 days.",
      triggers: { daysFromStart: 180, trendConfirmation: true },
      status: "locked",
    },
  ];
}

// Default targets use NEUTRAL (pre-FOMC) as the base. The /fomc page handler
// overrides this with the active scenario's weights before runPipeline.
export const FOMC_DEFAULT_TARGETS: ReadonlyArray<TargetWeight> = buildFomcTargets("neutral");

export const FOMC_TRANCHES: Tranche[] = buildFomcTranches(FOMC_DEFAULT_CAPITAL, FOMC_DEFAULT_CASH_BUFFER);

export const FOMC_PORTFOLIO: PortfolioConfig = {
  capital: FOMC_DEFAULT_CAPITAL,
  cashBuffer: FOMC_DEFAULT_CASH_BUFFER,
  targets: [...FOMC_DEFAULT_TARGETS],
  tranches: [...FOMC_TRANCHES],
  holdings: [],
  cash: FOMC_DEFAULT_CAPITAL,
};

// Per-sleeve caps cast to the bundle's expected type.
const SLEEVE_CAPS: Record<string, SleeveCap> = Object.fromEntries(
  Object.entries(FOMC_SLEEVE_CAPS).map(([k, v]) => [k, { hardPct: v.hardPct, softPct: (v as any).softPct }])
);

// Helper: build a bundle for a specific active scenario. Used by the /fomc
// page handler to swap target weights at request time without mutating the
// shared default bundle.
export function fomcBundleFor(scenario: FomcScenarioId): PortfolioBundle {
  const targets = [...buildFomcTargets(scenario)];
  return {
    kind: "fomc",
    label: `FOMC Playbook · ${FOMC_SCENARIOS[scenario].shortLabel}`,
    defaultCapital: FOMC_DEFAULT_CAPITAL,
    defaultCashBuffer: FOMC_DEFAULT_CASH_BUFFER,
    buildTranches: buildFomcTranches,
    base: {
      capital: FOMC_DEFAULT_CAPITAL,
      cashBuffer: FOMC_DEFAULT_CASH_BUFFER,
      targets,
      tranches: [...FOMC_TRANCHES],
      holdings: [],
      cash: FOMC_DEFAULT_CAPITAL,
    },
    roleToSleeve: FOMC_ROLE_TO_SLEEVE,
    sleeveLabel: FOMC_SLEEVE_LABEL,
    sleeveCaps: SLEEVE_CAPS,
    computeEtfOverlap: false,
    // Fidelity (the user's broker, per intake) supports fractional shares on
    // listed US equities via "Stock Slices" — enable for FOMC so high-priced
    // names like NVDA/AVGO never silently drop out as "<1 share" skips.
    allowFractionalShares: true,
  };
}

// Default bundle (neutral scenario). Used by API routes that don't carry
// scenario context, plus by static imports for ticker allow-listing.
export const fomcBundle: PortfolioBundle = fomcBundleFor("neutral");
