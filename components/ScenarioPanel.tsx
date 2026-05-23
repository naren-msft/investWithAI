import type { PipelineResult, ScenarioResult } from "@/types";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";
import { HelpLink } from "@/components/ui/HelpLink";
import { TrendingDown, TrendingUp, ArrowRight } from "lucide-react";

// "What if" scenario engine output. Each card answers:
//   - What does SPY look like under this scenario?
//   - Which phases would unlock that aren't unlocked today?
//   - Where would portfolio value land (via β linearization)?
//   - What size would the next tranche be after vol-cap at the scenario's VIX?

export function ScenarioPanel({ data }: { data: PipelineResult }) {
  const { scenarios, portfolioValue } = data;
  if (!scenarios || scenarios.length === 0) return null;

  // Probability-weighted expected outcomes — uses subjective prior probabilities
  // set in DEFAULT_SCENARIOS. Only counts scenarios that actually have a
  // probability assigned, then re-normalises so missing-prob scenarios don't
  // distort the math.
  const weighted = scenarios
    .map((s) => ({ s, p: s.spec.probability ?? 0 }))
    .filter((x) => x.p > 0);
  const probSum = weighted.reduce((acc, x) => acc + x.p, 0);
  const showExpected = probSum > 0;
  const expectedValue = showExpected
    ? weighted.reduce((acc, x) => acc + (x.p / probSum) * x.s.projectedPortfolioValue, 0)
    : 0;
  const expectedTranche = showExpected
    ? weighted.reduce((acc, x) => acc + (x.p / probSum) * x.s.nextTrancheUnderScenario, 0)
    : 0;
  const expectedDelta = expectedValue - portfolioValue;
  const expectedDeltaPct = portfolioValue > 0 ? expectedDelta / portfolioValue : 0;

  return (
    <CollapsibleCard
      storageKey="card:scenarios"
      helpSection="scenarios"
      title="Forward-looking scenarios"
      subtitle="What-if simulations using current invested-β. Regime is NOT recomputed — trend-confirm gates are explicit assumptions where flagged."
      right={<Badge variant="info">{scenarios.length} scenarios</Badge>}
    >

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {scenarios.map((s) => (
          <ScenarioCard key={s.spec.id} s={s} currentValue={portfolioValue} />
        ))}
      </div>

      {showExpected && (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
              Probability-weighted outlook
              <HelpLink section="probability-weighted" />
            </h3>
            <span className="text-[11px] subtle">
              priors: {weighted.map((x) => `${x.s.spec.name.split(" ")[0]} ${(x.p * 100).toFixed(0)}%`).join(" · ")}
              {probSum < 0.999 && ` · normalised`}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ExpectedTile
              label="Expected portfolio value"
              value={fmtUsd(expectedValue)}
              sub={`${expectedDelta >= 0 ? "+" : ""}${fmtUsd(expectedDelta)} (${(expectedDeltaPct * 100).toFixed(1)}%) vs today`}
              tone={expectedDelta >= 0 ? "up" : "down"}
            />
            <ExpectedTile
              label="Expected next tranche"
              value={fmtUsd(expectedTranche)}
              sub="probability-weighted across scenarios"
            />
            <ExpectedTile
              label="Coverage"
              value={`${(probSum * 100).toFixed(0)}%`}
              sub={`${weighted.length} of ${scenarios.length} scenarios weighted`}
              tone="muted"
            />
          </div>
          <p className="text-[10px] subtle mt-2 leading-relaxed">
            Probabilities are subjective base rates, not forecasts. They turn min/max bracket thinking into a single
            decision-ready number — useful when sizing positions.
          </p>
        </div>
      )}

      <p className="text-[10px] subtle mt-3 leading-relaxed">
        Projected value uses linearized exposure: <code className="kbd">value × (1 + spyMove × invested-β)</code>.
        Real moves deviate from this for high-β assets and during regime shifts. Phase unlocks under each scenario use the
        existing historical SPY peak as the drawdown anchor — only spot price moves; the time gate is unchanged
        from today.
      </p>
    </CollapsibleCard>
  );
}

function ExpectedTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "up" | "down" | "muted";
}) {
  const valueClass =
    tone === "up"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "down"
        ? "text-red-700 dark:text-red-300"
        : tone === "muted"
          ? "text-ink-muted"
          : "text-ink";
  return (
    <div className="rounded-lg bg-surface-3 px-3 py-2 border border-line">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-semibold text-base font-mono ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] subtle mt-0.5">{sub}</div>}
    </div>
  );
}

function ScenarioCard({ s, currentValue }: { s: ScenarioResult; currentValue: number }) {
  const dn = s.spec.spyMovePct < 0;
  const newPhases = s.phaseOutcomes.filter((p) => p.newlyUnlocked);
  const stillLocked = s.phaseOutcomes.filter((p) => !p.nowReady);
  const valueDelta = s.projectedPortfolioValue - currentValue;
  const valueDeltaPct = currentValue > 0 ? valueDelta / currentValue : 0;

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            {dn ? (
              <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
            ) : (
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <div className="font-semibold text-sm">{s.spec.name}</div>
          </div>
          <div className="text-[11px] subtle mt-0.5">{s.spec.description}</div>
        </div>
        <Badge variant={dn ? "danger" : "success"}>
          SPY {s.spec.spyMovePct >= 0 ? "+" : ""}{(s.spec.spyMovePct * 100).toFixed(0)}%
        </Badge>
      </div>

      {typeof s.spec.probability === "number" && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="subtle">Prior probability</span>
          <span className="font-mono font-semibold text-ink">
            {(s.spec.probability * 100).toFixed(0)}%
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Mini label="Synthetic SPY" value={s.syntheticSpyPrice.toFixed(2)} />
        <Mini label="Drawdown from peak" value={`${(s.syntheticDrawdownFromPeak * 100).toFixed(1)}%`} />
        <Mini label="Projected value" value={fmtUsd(s.projectedPortfolioValue)}
              sub={`${valueDelta >= 0 ? "+" : ""}${fmtUsd(valueDelta)} (${(valueDeltaPct * 100).toFixed(1)}%)`} />
        <Mini label="Next tranche" value={fmtUsd(s.nextTrancheUnderScenario)}
              sub={`vol cap ${s.scenarioVolGate.cap}× (${s.scenarioVolGate.level})`} />
      </div>

      <div className="rounded-md bg-surface-3 px-2.5 py-2 text-xs">
        <div className="font-medium text-[11px] uppercase tracking-wider subtle mb-1.5">Phase progression</div>
        {newPhases.length === 0 ? (
          <div className="subtle">No additional phases unlock under this scenario.</div>
        ) : (
          <ul className="space-y-0.5">
            {newPhases.map((p) => (
              <li key={p.phase} className="flex items-baseline gap-1.5">
                <ArrowRight className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400 self-center" />
                <span className="font-medium">P{p.phase}</span>
                <span className="font-mono">{fmtUsd(p.size)}</span>
                <span className="subtle">— {p.note}</span>
              </li>
            ))}
          </ul>
        )}
        {newPhases.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-line subtle">
            Cumulative newly-unlocked capital: <span className="font-mono font-semibold text-ink">{fmtUsd(s.cumulativeNewlyUnlockedUsd)}</span>
          </div>
        )}
        {stillLocked.length > 0 && (
          <div className="mt-1.5 text-[10px] subtle">
            Still locked: {stillLocked.map((p) => `P${p.phase}`).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-surface-3 px-2 py-1.5">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
      {sub && <div className="subtle text-[10px] mt-0.5">{sub}</div>}
    </div>
  );
}
