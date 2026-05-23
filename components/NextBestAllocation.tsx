import type { PipelineResult, SkippedBuy, SkippedBuyCode, DriftRow, SignalRow } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";
import { ArrowRight } from "lucide-react";

// "Where would the next dollar go *if* a condition flipped?"
// Maps each SkippedBuyCode to the condition that would unlock the position,
// and ranks ETFs by how much capital would flow if the condition were met
// (= unfilled drift). Top 5 shown.

const UNLOCK_CONDITION: Record<SkippedBuyCode, string> = {
  "avoid-rsi":             "if RSI drops below 70 (signal flips off AVOID)",
  "rsi-overbought":        "if RSI drops below 70 (overbought gate clears)",
  "not-underweight":       "if drift goes positive (price drops or other sleeves rebalance)",
  "drift-tiny":            "if drift grows past the $1k floor",
  "sector-cap-hard":       "if sector exposure falls below 35% (hard cap relaxes)",
  "sector-cap-soft-zero":  "if sector exposure falls below 25% or tranche grows",
  "tranche-zero":          "when the next phase unlocks (vol gate clears / drawdown trigger fires)",
  "fractional-share":      "if the tranche grows or the share price falls",
  "other":                 "when the underlying condition resolves",
};

interface QueueItem {
  ticker: string;
  reason: string;
  condition: string;
  potentialUsd: number;        // unfilled drift dollars
  currentRsi?: number;
  driftPct?: number;
}

function buildQueue(
  skipped: SkippedBuy[],
  drift: DriftRow[],
  signals: SignalRow[],
): QueueItem[] {
  const driftByTicker = new Map(drift.map((d) => [d.ticker, d]));
  const sigByTicker = new Map(signals.map((s) => [s.ticker, s]));
  const items: QueueItem[] = [];
  for (const s of skipped) {
    const d = driftByTicker.get(s.ticker);
    const sig = sigByTicker.get(s.ticker);
    items.push({
      ticker: s.ticker,
      reason: s.reason,
      condition: UNLOCK_CONDITION[s.code] ?? "—",
      potentialUsd: d ? Math.max(0, d.driftUsd) : 0,
      currentRsi: sig?.rsi,
      driftPct: d?.driftPct,
    });
  }
  // Sort: largest unfilled drift first; ties broken by ticker alpha for stability.
  return items
    .sort((a, b) => b.potentialUsd - a.potentialUsd || a.ticker.localeCompare(b.ticker))
    .slice(0, 5);
}

export function NextBestAllocation({ data }: { data: PipelineResult }) {
  const queue = buildQueue(data.skippedBuys, data.drift, data.signals);
  if (queue.length === 0) return null;
  const totalPotential = queue.reduce((s, q) => s + q.potentialUsd, 0);

  return (
    <Card>
      <CardHeader
        helpSection="next-best-allocation"
        title="Next best allocation"
        subtitle="If the gate flipped, where would the next dollar go? Ranked by unfilled drift."
        right={
          <Badge variant="info">
            {fmtUsd(totalPotential)} in queue
          </Badge>
        }
      />
      <ol className="space-y-2">
        {queue.map((q, i) => (
          <li
            key={q.ticker}
            className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-3"
          >
            <div className="flex-none w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center font-semibold text-sm">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-base font-mono">{q.ticker}</span>
                {q.potentialUsd > 0 && (
                  <Badge variant="success">
                    {fmtUsd(q.potentialUsd)} unfilled
                  </Badge>
                )}
                {Number.isFinite(q.currentRsi) && (
                  <span className="text-[11px] subtle">RSI {(q.currentRsi as number).toFixed(1)}</span>
                )}
                {Number.isFinite(q.driftPct) && (
                  <span className="text-[11px] subtle">
                    {((q.driftPct as number) * 100).toFixed(2)}% below target
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-2 text-xs">
                <span className="text-ink-muted">Currently blocked:</span>
                <span className="text-ink">{q.reason}</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-2 text-xs">
                <ArrowRight className="w-3 h-3 text-emerald-500 self-center" />
                <span className="text-ink-muted">Unlocks:</span>
                <span className="text-ink">{q.condition}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 text-[11px] subtle">
        Ranking uses unfilled drift dollars — the size of the buy that would land if the condition cleared. See <span className="font-medium">Under-deployment explained</span> for the full skipped list.
      </div>
    </Card>
  );
}
