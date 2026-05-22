import type { BuyRecommendation } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { FIDELITY_TRADE_URL } from "@/config/portfolio";
import { fmtUsd, fmtNum } from "@/lib/format";
import { DayChange } from "@/components/AllocationTable";
import { ExternalLink, TrendingUp } from "lucide-react";

export function BuyRecommendations({
  recs,
  trancheBudget,
}: {
  recs: BuyRecommendation[];
  trancheBudget: number;
}) {
  const top = recs;
  const totalUsd = recs.reduce((s, r) => s + r.dollars, 0);
  const utilization = trancheBudget > 0 ? totalUsd / trancheBudget : 0;
  const leftover = Math.max(0, trancheBudget - totalUsd);
  return (
    <Card>
      <CardHeader
        title="Top buy recommendations"
        subtitle="Sized from the current tranche × effective weights · capped at each ETF's remaining drift."
        right={<Badge variant="info">{recs.length} candidates</Badge>}
      />
      {top.length === 0 ? (
        <p className="text-sm subtle">No qualifying buys right now. Wait for setups or the next tranche window.</p>
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
                <div className="mt-3 flex items-center gap-2">
                  <LinkButton href={FIDELITY_TRADE_URL(r.ticker)} target="_blank" rel="noreferrer" variant="primary" className="text-xs">
                    <TrendingUp className="w-3.5 h-3.5" /> Trade on Fidelity
                    <ExternalLink className="w-3 h-3" />
                  </LinkButton>
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
