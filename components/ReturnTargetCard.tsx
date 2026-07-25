import type { PipelineResult } from "@/types";
import { FOMC_SCENARIOS, type FomcScenarioId } from "@/config/fomc-scenarios";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";
import { TrendingUp, Target, Calendar } from "lucide-react";
import { clsx } from "@/components/ui/cn";

// User-stated return targets from the v4 PDF intake.
const ONE_YEAR_TARGET_LOW = 0.20;
const ONE_YEAR_TARGET_HIGH = 0.30;
const TWO_THREE_YEAR_TARGET = 1.00;

/**
 * Return-target tracker. Compares current portfolio value to the user's
 * stated 1yr / 2-3yr return goals and shows probability-weighted expected
 * return based on scenario probabilities.
 */
export function ReturnTargetCard({
  data,
  scenario,
}: {
  data: PipelineResult;
  scenario: FomcScenarioId;
}) {
  const { capital, portfolioValue, deployedUsd } = data;

  // Two views of realized return:
  //  - totalPct:    against total capital   (what the user sees on the headline)
  //  - investedPct: against deployed cost   (what their picks actually returned)
  const realizedUsd = portfolioValue - capital;
  const totalPct = capital > 0 ? realizedUsd / capital : 0;
  const investedPct = deployedUsd > 0 ? realizedUsd / deployedUsd : 0;

  // Target dollar values
  const oneYrLowUsd = capital * (1 + ONE_YEAR_TARGET_LOW);
  const oneYrHighUsd = capital * (1 + ONE_YEAR_TARGET_HIGH);
  const twoThreeYrUsd = capital * (1 + TWO_THREE_YEAR_TARGET);

  // Probability-weighted expected 1yr return from FOMC scenarios.
  // - When NEUTRAL (no bet yet): blend across all scenarios weighted by their probability.
  // - When CUT/HOLD/HIKE (user has picked): assume that scenario plays out
  //   (deterministic), so expected = that scenario's spyMovePct × β.
  // β proxy = portfolio beta of TARGET weights from the pipeline.
  const beta = data.forwardRisk?.portfolioBeta ?? 1;
  const isActiveBet = scenario !== "neutral";
  const expected1yr = (() => {
    if (isActiveBet) {
      const s = FOMC_SCENARIOS[scenario];
      return s.spyMovePct * beta;
    }
    let sum = 0;
    let pSum = 0;
    for (const s of Object.values(FOMC_SCENARIOS)) {
      if (s.probability <= 0) continue;
      sum += s.probability * s.spyMovePct * beta;
      pSum += s.probability;
    }
    return pSum > 0 ? sum / pSum : 0;
  })();

  const expectedUsd = capital * expected1yr;
  const gapVsLowTargetPct = ONE_YEAR_TARGET_LOW - expected1yr;
  const hitsLowTarget = expected1yr >= ONE_YEAR_TARGET_LOW;
  const hitsHighTarget = expected1yr >= ONE_YEAR_TARGET_HIGH;

  // N17 — bear/base/bull range. Rather than show a single point estimate
  // (false precision), show the realistic spread of outcomes.
  //   • base = expected1yr (as computed above)
  //   • bull = the most-bullish FOMC scenario's SPY move × β (best case)
  //   • bear = the most-bearish FOMC scenario's SPY move × β (worst case)
  // Active-bet mode adds a ±25% confidence band around the picked scenario
  // (rough proxy for one-σ idiosyncratic stock risk on top of the macro call).
  const allScenarios = Object.values(FOMC_SCENARIOS);
  const bullCase = (() => {
    const best = allScenarios.reduce((m, s) => (s.spyMovePct > m.spyMovePct ? s : m), allScenarios[0]);
    return isActiveBet ? scenarioMetaBeta(scenario, beta) * 1.25 : best.spyMovePct * beta;
  })();
  const bearCase = (() => {
    const worst = allScenarios.reduce((m, s) => (s.spyMovePct < m.spyMovePct ? s : m), allScenarios[0]);
    return isActiveBet ? scenarioMetaBeta(scenario, beta) * 0.5 - 0.10 : worst.spyMovePct * beta;
  })();

  const scenarioMeta = FOMC_SCENARIOS[scenario];

  function scenarioMetaBeta(s: FomcScenarioId, b: number): number {
    return FOMC_SCENARIOS[s].spyMovePct * b;
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-500" />
            Return target tracker
          </span>
        }
        subtitle={`Goal: +20–30% in 1yr · +100% in 2–3yr. Probability-weighted using FOMC scenarios (current active: ${scenarioMeta.shortLabel}).`}
        right={
          <Badge variant={hitsLowTarget ? "success" : hitsHighTarget ? "info" : "warn"}>
            {hitsHighTarget ? "on-track high" : hitsLowTarget ? "on-track low" : "below target"}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Current portfolio value */}
        <TargetTile
          label="Today"
          value={fmtUsd(portfolioValue)}
          sub={
            deployedUsd > 0
              ? `Total ${totalPct >= 0 ? "+" : ""}${(totalPct * 100).toFixed(1)}% · Invested ${investedPct >= 0 ? "+" : ""}${(investedPct * 100).toFixed(1)}%`
              : `cost basis ${fmtUsd(capital)} · 0 deployed`
          }
          tone={totalPct >= 0 ? "good" : "bad"}
          icon={<Calendar className="w-3.5 h-3.5" />}
        />

        {/* Probability-weighted expected return with bear/base/bull range */}
        <TargetTile
          label={isActiveBet ? `1yr range · ${scenarioMeta.shortLabel}` : "1yr range · blended"}
          value={`${expected1yr >= 0 ? "+" : ""}${(expected1yr * 100).toFixed(1)}%`}
          sub={`bear ${(bearCase * 100).toFixed(0)}% · bull +${(bullCase * 100).toFixed(0)}% · β=${beta.toFixed(2)}`}
          tone={hitsLowTarget ? "good" : "warn"}
          icon={<TrendingUp className="w-3.5 h-3.5" />}
        />

        {/* 1yr low/high target */}
        <TargetTile
          label="1yr target band"
          value={`${fmtUsd(oneYrLowUsd)} – ${fmtUsd(oneYrHighUsd)}`}
          sub={`+20% to +30% · gap ${(gapVsLowTargetPct * 100).toFixed(1)}pp to low end`}
          tone={hitsLowTarget ? "good" : "warn"}
          icon={<Target className="w-3.5 h-3.5" />}
        />

        {/* 2-3yr target */}
        <TargetTile
          label="2–3yr target"
          value={fmtUsd(twoThreeYrUsd)}
          sub={`+100% · requires ~26% CAGR`}
          tone="info"
          icon={<TrendingUp className="w-3.5 h-3.5" />}
        />
      </div>

      <div className="mt-3 text-[11px] subtle leading-relaxed">
        <span className="font-semibold text-ink">How "Expected 1yr" is computed:</span>{" "}
        {isActiveBet
          ? <>active scenario <strong>{scenarioMeta.shortLabel}</strong> assumed to play out, expected = <code className="kbd">spy-move × portfolio-β</code> ({(scenarioMeta.spyMovePct * 100).toFixed(0)}% × {beta.toFixed(2)}).</>
          : <>blended across all scenarios: <code className="kbd">Σ probability × spy-move × portfolio-β</code> (CUT 20% / HOLD 35% / HIKE 45%; SPY moves +18% / +6% / −10%).</>
        }{" "}
        This is an estimate, not a forecast — actual returns depend on individual stock alpha vs. market beta, idiosyncratic earnings, and macro surprises.
      </div>
    </Card>
  );
}

function TargetTile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "bad" | "warn" | "info";
  icon?: React.ReactNode;
}) {
  const toneClasses = {
    good: "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-900/10",
    bad:  "border-red-500/40 bg-red-50/40 dark:bg-red-900/10",
    warn: "border-amber-500/40 bg-amber-50/40 dark:bg-amber-900/10",
    info: "border-sky-500/40 bg-sky-50/40 dark:bg-sky-900/10",
  } as const;
  return (
    <div className={clsx("rounded-lg border p-3", toneClasses[tone])}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide subtle">
        {icon} {label}
      </div>
      <div className="text-base font-bold tracking-tight mt-0.5 font-mono">{value}</div>
      <div className="text-[11px] subtle mt-1">{sub}</div>
    </div>
  );
}
