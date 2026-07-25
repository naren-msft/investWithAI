import Link from "next/link";
import { notFound } from "next/navigation";
import { getStockDetail } from "@/lib/stockDetail";
import { FOMC_UNIVERSE } from "@/config/fomc-scenarios";
import { FIDELITY_TRADE_URL } from "@/config/portfolio";
import { Card } from "@/components/ui/Card";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { LinkButton } from "@/components/ui/Button";
import { PriceChart } from "@/components/PriceChart";
import { CollapseExpandButtons } from "@/components/CollapseExpandButtons";
import { fmtNum } from "@/lib/format";
import { ArrowLeft, ExternalLink, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

// Drill-down for /fomc — re-uses the existing stockDetail engine. Only the
// "back" link target and the per-ticker meta lookup differ from /stocks/[ticker].
export default async function FomcTickerPage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();
  const detail = await getStockDetail(ticker);
  if (!detail) notFound();

  const target = FOMC_UNIVERSE.find((t) => t.ticker === ticker);

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href="/fomc" className="inline-flex items-center gap-1 text-sm subtle hover:text-ink">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to FOMC dashboard
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <CollapseExpandButtons />
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase subtle tracking-wider">
              {[detail.sector, detail.industry].filter(Boolean).join(" · ") || "—"}
            </div>
            <h1 className="text-3xl font-bold tracking-tight mt-0.5">{detail.ticker}</h1>
            <p className="text-sm subtle mt-0.5">{detail.name}</p>
            {target && (
              <div className="text-xs subtle mt-1">
                FOMC universe: <span className="text-ink capitalize">{target.tier}</span> tier ·
                role: <span className="text-ink">{target.role}</span> ·
                cap: <span className="font-mono text-ink">{(target.maxPositionPct * 100).toFixed(1)}%</span>
                {target.limitPctBelowMid != null && target.limitPctBelowMid > 0 && (
                  <> · suggested limit: <span className="font-mono text-ink">−{(target.limitPctBelowMid * 100).toFixed(1)}%</span> from mid</>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">${fmtNum(detail.price, 2)}</div>
            <div className={`text-sm font-mono ${detail.change >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
              {detail.change >= 0 ? "+" : ""}${fmtNum(detail.change, 2)} ({detail.changePct.toFixed(2)}%)
            </div>
            <div className="mt-2">
              <LinkButton href={FIDELITY_TRADE_URL(ticker)} target="_blank" rel="noreferrer" variant="primary" className="text-xs">
                <TrendingUp className="w-3.5 h-3.5" /> Trade on Fidelity <ExternalLink className="w-3 h-3" />
              </LinkButton>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
          {detail.marketCap   != null && <Stat label="Market cap"   value={`$${(detail.marketCap / 1e9).toFixed(2)}B`} />}
          {detail.trailingPE  != null && <Stat label="P/E (TTM)"    value={detail.trailingPE.toFixed(1)} />}
          {detail.forwardPE   != null && <Stat label="P/E (fwd)"    value={detail.forwardPE.toFixed(1)} />}
          {detail.beta        != null && <Stat label="Beta"         value={detail.beta.toFixed(2)} />}
          {detail.priceToBook != null && <Stat label="P/B"          value={detail.priceToBook.toFixed(2)} />}
          {detail.pegRatio    != null && <Stat label="PEG"          value={detail.pegRatio.toFixed(2)} />}
          {detail.trailingEps != null && <Stat label="EPS (TTM)"    value={`$${detail.trailingEps.toFixed(2)}`} />}
          {detail.forwardEps  != null && <Stat label="EPS (fwd)"    value={`$${detail.forwardEps.toFixed(2)}`} />}
          {detail.revenueGrowth  != null && <Stat label="Rev growth"  value={`${(detail.revenueGrowth * 100).toFixed(1)}%`}  tone={detail.revenueGrowth  >= 0 ? "gain" : "loss"} />}
          {detail.earningsGrowth != null && <Stat label="EPS growth"  value={`${(detail.earningsGrowth * 100).toFixed(1)}%`} tone={detail.earningsGrowth >= 0 ? "gain" : "loss"} />}
          <Stat label="52-wk range" value={detail.fiftyTwoWeekLow && detail.fiftyTwoWeekHigh ? `$${fmtNum(detail.fiftyTwoWeekLow, 2)} – $${fmtNum(detail.fiftyTwoWeekHigh, 2)}` : "—"} />
          {detail.earningsDate && <Stat label="Next earnings" value={detail.earningsDate} />}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CollapsibleCard storageKey={`card:fomc-detail:${ticker}:profile`} title="Company profile" subtitle={[detail.country, detail.industry].filter(Boolean).join(" · ")}>
          {detail.longBusinessSummary
            ? <p className="text-sm leading-relaxed">{detail.longBusinessSummary}</p>
            : <p className="subtle text-sm">No profile available.</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-xs subtle">
            {detail.fullTimeEmployees != null && <span>{detail.fullTimeEmployees.toLocaleString()} employees</span>}
            {detail.website && (
              <a href={detail.website} target="_blank" rel="noreferrer" className="text-emerald-700 dark:text-emerald-300 hover:underline inline-flex items-center gap-1">
                Website <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </CollapsibleCard>

        <CollapsibleCard storageKey={`card:fomc-detail:${ticker}:technicals`} title="Technicals" subtitle="Live RSI / MACD / SMA — same engine that powers the buy signals.">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="RSI-14"    value={Number.isFinite(detail.technicals.rsi14) ? detail.technicals.rsi14.toFixed(1) : "—"}
                  tone={detail.technicals.rsi14 >= 70 ? "loss" : detail.technicals.rsi14 <= 35 ? "gain" : undefined} />
            <Stat label="MACD hist" value={Number.isFinite(detail.technicals.macdHist) ? detail.technicals.macdHist.toFixed(3) : "—"}
                  tone={detail.technicals.macdHist > 0 ? "gain" : detail.technicals.macdHist < 0 ? "loss" : undefined} />
            <Stat label="MACD line" value={Number.isFinite(detail.technicals.macdLine) ? detail.technicals.macdLine.toFixed(3) : "—"} />
            <Stat label="SMA 50"    value={Number.isFinite(detail.technicals.sma50)  ? `$${detail.technicals.sma50.toFixed(2)}`  : "—"} />
            <Stat label="SMA 200"   value={Number.isFinite(detail.technicals.sma200) ? `$${detail.technicals.sma200.toFixed(2)}` : "—"} />
            <Stat label="Price vs 50d"  value={detail.fiftyDayAverage  ? `${(((detail.price - detail.fiftyDayAverage) / detail.fiftyDayAverage) * 100).toFixed(2)}%` : "—"} />
          </div>
        </CollapsibleCard>
      </div>

      <PriceChart tickers={[ticker]} />

      <footer className="mt-6 p-4 text-xs subtle border-t border-line">
        Data from Yahoo Finance via <code className="kbd">yahoo-finance2</code>. Educational use only — not investment advice.
      </footer>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  const cls = tone === "gain" ? "text-emerald-700 dark:text-emerald-300"
            : tone === "loss" ? "text-red-700 dark:text-red-300" : "";
  return (
    <div className="rounded-lg bg-surface-2 border border-line px-3 py-2">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-mono text-sm ${cls}`}>{value}</div>
    </div>
  );
}
