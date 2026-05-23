import type { BuyRecommendation, SkippedBuy } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FIDELITY_TRADE_URL, ROBINHOOD_TRADE_URL, SCHWAB_TRADE_URL } from "@/config/portfolio";
import { fmtUsd, fmtNum } from "@/lib/format";
import { DayChange } from "@/components/AllocationTable";
import { ExternalLink, TrendingUp } from "lucide-react";

export function BuyRecommendations({
  recs,
  trancheBudget,
  skipped = [],
  phaseReady = true,
  lockedReason,
}: {
  recs: BuyRecommendation[];
  trancheBudget: number;
  skipped?: SkippedBuy[];
  phaseReady?: boolean;
  lockedReason?: string;
}) {
  const top = recs;
  const totalUsd = recs.reduce((s, r) => s + r.dollars, 0);
  const utilization = trancheBudget > 0 ? totalUsd / trancheBudget : 0;
  const leftover = Math.max(0, trancheBudget - totalUsd);

  // The pipeline-computed `skipped` is the source of truth for "why isn't every
  // ETF here?" — covers AVOID/RSI gates, drift floor, sector caps (hard & soft-zero),
  // and zero-tranche scenarios. Hide tranche-zero rows when displayed individually
  // — they're already explained by the locked-phase banner.
  const skippedToShow = phaseReady ? skipped.filter((s) => s.code !== "tranche-zero") : [];
  return (
    <Card>
      <CardHeader helpSection="recommendations"
        title="Top buy recommendations"
        subtitle="Sized from the current tranche × effective weights · capped at each ETF's remaining drift."
        right={<Badge variant="info">{recs.length} candidates</Badge>}
      />
      {top.length === 0 ? (
        !phaseReady ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <div className="font-medium mb-1">Waiting for next phase trigger</div>
            <p className="subtle leading-relaxed">{lockedReason ?? "All phases are currently locked."}</p>
            <p className="subtle text-xs mt-2">
              No buys are sized while the current phase is locked. See the <span className="font-medium">Staged capital deployment</span> card for per-phase triggers and progress.
            </p>
          </div>
        ) : (
          <p className="text-sm subtle">No qualifying buys right now. Wait for setups or the next tranche window.</p>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {top.map((r) => (
              <div key={r.ticker} className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-base">{r.ticker}</div>
                    <SignalBadge signal={r.signal} />
                  </div>
                  <Badge variant="default">${fmtNum(r.price, 2)} · <DayChange pct={r.dayChangePct} size="sm" /></Badge>
                </div>
                <div className="mt-1 text-xs subtle truncate">{r.name}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Buy"    value={fmtUsd(r.dollars)} />
                  <Stat label="Shares" value={String(r.shares)} />
                  <Stat label="RSI-14" value={fmtNum(r.rsi, 1)} />
                  <Stat label="MACD h" value={fmtNum(r.macdHist, 3)} />
                </div>
                <p className="text-[11px] subtle mt-3 leading-relaxed">{r.reason}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <a
                    href={FIDELITY_TRADE_URL(r.ticker)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium px-2 py-1 transition-colors"
                    title={`Trade ${r.ticker} on Fidelity`}
                  >
                    <TrendingUp className="w-3 h-3" /> Fidelity
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <a
                    href={ROBINHOOD_TRADE_URL(r.ticker)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-[#00C805] hover:bg-[#00B305] text-black text-[11px] font-medium px-2 py-1 transition-colors"
                    title={`Trade ${r.ticker} on Robinhood`}
                  >
                    <TrendingUp className="w-3 h-3" /> Robinhood
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <a
                    href={SCHWAB_TRADE_URL(r.ticker)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-[#00A0DF] hover:bg-[#0090CF] text-white text-[11px] font-medium px-2 py-1 transition-colors"
                    title={`Trade ${r.ticker} on Charles Schwab`}
                  >
                    <TrendingUp className="w-3 h-3" /> Schwab
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-medium">Reconciliation</span>
            <span className="subtle">
              <span className="font-mono">{fmtUsd(totalUsd)}</span> of{" "}
              <span className="font-mono">{fmtUsd(trancheBudget)}</span> tranche allocated
              {" · "}
              <span className="font-mono">{(utilization * 100).toFixed(1)}%</span> utilized
            </span>
            <span className="subtle">
              Leftover this phase: <span className="font-mono">{fmtUsd(leftover)}</span>
            </span>
          </div>

          {skippedToShow.length > 0 && (
            <div className="mt-3 rounded-lg border border-line bg-surface-3/40 p-3 text-xs">
              <div className="font-medium mb-1.5">Why isn&apos;t every ETF here?</div>
              <div className="subtle mb-2">
                Each excluded ETF was filtered at one of these gates: <span className="font-medium text-ink">drift &gt; $1k · signal ≠ AVOID · RSI &lt; 70 · sector cap · whole shares</span>.
                {skippedToShow.length} ETF{skippedToShow.length === 1 ? " was" : "s were"} excluded:
              </div>
              <ul className="space-y-0.5">
                {skippedToShow.map((f) => (
                  <li key={f.ticker} className="flex items-baseline gap-2">
                    <span className="font-semibold w-12">{f.ticker}</span>
                    <span className="subtle">{f.reason}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[10px] subtle">
                See the <span className="font-medium">Under-deployment explained</span> card above for the dashboard-level summary, or the <span className="font-medium">Allocation table</span> for full per-ETF numbers.
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-3 px-2 py-1.5">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}

function SignalBadge({ signal }: { signal: BuyRecommendation["signal"] }) {
  const v = signal === "BUY" ? "success" : signal === "AVOID" ? "danger" : "default";
  return <Badge variant={v as any}>{signal}</Badge>;
}
