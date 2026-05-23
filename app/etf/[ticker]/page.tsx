import Link from "next/link";
import { notFound } from "next/navigation";
import { getEtfDetail } from "@/lib/etfDetail";
import { TARGETS, FIDELITY_TRADE_URL } from "@/config/portfolio";
import { Card, CardHeader } from "@/components/ui/Card";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { PriceChart } from "@/components/PriceChart";
import { CollapseExpandButtons } from "@/components/CollapseExpandButtons";
import { fmtUsd, fmtNum, fmtPct } from "@/lib/format";
import { ArrowLeft, ExternalLink, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EtfPage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();
  const detail = await getEtfDetail(ticker);
  if (!detail) notFound();

  const target = TARGETS.find((t) => t.ticker === ticker);

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href="/etf" className="inline-flex items-center gap-1 text-sm subtle hover:text-ink">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <CollapseExpandButtons />
        </div>
      </div>

      {/* Header */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase subtle tracking-wider">{detail.family} · {detail.category}</div>
            <h1 className="text-3xl font-bold tracking-tight mt-0.5">{detail.ticker}</h1>
            <p className="text-sm subtle mt-0.5">{detail.name}</p>
            {target && (
              <div className="text-xs subtle mt-1">
                In your portfolio: <span className="font-mono text-ink">{(target.weight * 100).toFixed(1)}%</span> target · role: <span className="text-ink">{target.role}</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">${fmtNum(detail.price, 2)}</div>
            <div className={`text-sm font-mono ${detail.change >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
              {detail.change >= 0 ? "+" : ""}${fmtNum(detail.change, 2)} ({(detail.changePct).toFixed(2)}%)
            </div>
            <div className="mt-2">
              <LinkButton href={FIDELITY_TRADE_URL(ticker)} target="_blank" rel="noreferrer" variant="primary" className="text-xs">
                <TrendingUp className="w-3.5 h-3.5" /> Trade on Fidelity <ExternalLink className="w-3 h-3" />
              </LinkButton>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
          {detail.totalAssets ? <Stat label="AUM"            value={`$${(detail.totalAssets / 1e9).toFixed(2)}B`} /> : null}
          {detail.expenseRatio ? <Stat label="Expense ratio" value={`${(detail.expenseRatio * 100).toFixed(2)}%`} /> : null}
          {detail.inception ? <Stat label="Inception"        value={detail.inception} /> : null}
          {detail.beta ? <Stat label="Beta (5Y mo)"          value={detail.beta.toFixed(2)} /> : null}
          {detail.yield ? <Stat label="Yield"                value={`${(detail.yield * 100).toFixed(2)}%`} /> : null}
          <Stat label="52-wk range" value={detail.fiftyTwoWeekLow && detail.fiftyTwoWeekHigh ? `$${fmtNum(detail.fiftyTwoWeekLow, 2)} – $${fmtNum(detail.fiftyTwoWeekHigh, 2)}` : "—"} />
        </div>
      </Card>

      {/* Performance */}
      <CollapsibleCard storageKey={`card:etf-detail:${ticker}:performance`} title="Performance" subtitle="Trailing total returns (annualized for periods > 1 year)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left subtle text-[11px] uppercase tracking-wider">
                {detail.trailingReturns.map((p) => <th key={p.period} className="py-2 px-3 text-right">{p.period}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                {detail.trailingReturns.map((p) => (
                  <td key={p.period} className={`py-2 px-3 text-right font-mono ${p.value == null ? "subtle" : p.value >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                    {p.value == null ? "—" : `${p.value >= 0 ? "+" : ""}${(p.value * 100).toFixed(2)}%`}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {detail.annualReturns.length > 0 && (
          <>
            <div className="mt-4 text-[11px] uppercase tracking-wider subtle">Calendar-year returns</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {detail.annualReturns.slice().sort((a, b) => b.year - a.year).map((r) => (
                <div key={r.year} className={`rounded-md px-2 py-1 text-xs border ${r.value >= 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"}`}>
                  <span className="font-medium">{r.year}</span> <span className="font-mono">{r.value >= 0 ? "+" : ""}{(r.value * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CollapsibleCard>

      {/* Risk + Technicals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CollapsibleCard storageKey={`card:etf-detail:${ticker}:risk`} title="Risk (3-year)" subtitle="From Yahoo Finance fund performance module.">
          {detail.riskStats3y ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {detail.riskStats3y.stdDev != null  && <Stat label="Std Dev"   value={`${detail.riskStats3y.stdDev.toFixed(2)}%`} />}
              {detail.riskStats3y.beta != null    && <Stat label="Beta"      value={detail.riskStats3y.beta.toFixed(2)} />}
              {detail.riskStats3y.alpha != null   && <Stat label="Alpha"     value={detail.riskStats3y.alpha.toFixed(2)} />}
              {detail.riskStats3y.sharpe != null  && <Stat label="Sharpe"    value={detail.riskStats3y.sharpe.toFixed(2)} />}
              {detail.riskStats3y.rSquared != null && <Stat label="R²"       value={detail.riskStats3y.rSquared.toFixed(2)} />}
              {detail.morningstarRating != null   && <Stat label="M★ Rating" value={`${detail.morningstarRating} / 5`} />}
            </div>
          ) : <p className="subtle text-sm">No 3-year risk statistics available for this ETF.</p>}
        </CollapsibleCard>

        <CollapsibleCard storageKey={`card:etf-detail:${ticker}:technicals`} title="Technicals" subtitle="Live RSI / MACD / SMA — same engine that powers the buy signals.">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="RSI-14"    value={Number.isFinite(detail.technicals.rsi14) ? detail.technicals.rsi14.toFixed(1) : "—"}
                  tone={detail.technicals.rsi14 >= 70 ? "loss" : detail.technicals.rsi14 <= 35 ? "gain" : undefined} />
            <Stat label="MACD hist" value={Number.isFinite(detail.technicals.macdHist) ? detail.technicals.macdHist.toFixed(3) : "—"}
                  tone={detail.technicals.macdHist > 0 ? "gain" : detail.technicals.macdHist < 0 ? "loss" : undefined} />
            <Stat label="MACD line" value={Number.isFinite(detail.technicals.macdLine) ? detail.technicals.macdLine.toFixed(3) : "—"} />
            <Stat label="SMA 50"    value={Number.isFinite(detail.technicals.sma50)  ? `$${detail.technicals.sma50.toFixed(2)}`  : "—"} />
            <Stat label="SMA 200"   value={Number.isFinite(detail.technicals.sma200) ? `$${detail.technicals.sma200.toFixed(2)}` : "—"} />
            <Stat label="Price vs 50d"  value={detail.fiftyDayAverage      ? `${(((detail.price - detail.fiftyDayAverage) / detail.fiftyDayAverage) * 100).toFixed(2)}%` : "—"} />
          </div>
        </CollapsibleCard>
      </div>

      {/* Price + RSI chart (reuses existing component) */}
      <PriceChart tickers={[ticker]} />

      {/* Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CollapsibleCard storageKey={`card:etf-detail:${ticker}:holdings`} title="Top 10 holdings" subtitle={`Top-10 represents ${(detail.topHoldings.reduce((s, h) => s + h.weight, 0) * 100).toFixed(1)}% of fund.`}>
          {detail.topHoldings.length === 0 ? <p className="subtle text-sm">Holdings data unavailable.</p> : (
            <div className="space-y-1.5">
              {detail.topHoldings.map((h) => (
                <div key={h.symbol} className="flex items-center justify-between gap-2 text-sm border-b border-line py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium">{h.symbol}</span>
                    <span className="subtle truncate">{h.name}</span>
                  </div>
                  <span className="font-mono">{(h.weight * 100).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleCard>

        <CollapsibleCard storageKey={`card:etf-detail:${ticker}:sectors`} title="Sector breakdown">
          {detail.sectorWeightings.length === 0 ? <p className="subtle text-sm">Sector data unavailable.</p> : (
            <div className="space-y-2">
              {detail.sectorWeightings.sort((a, b) => b.weight - a.weight).map((s) => (
                <div key={s.sector}>
                  <div className="flex justify-between text-sm">
                    <span>{s.sector}</span>
                    <span className="font-mono">{(s.weight * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full bg-brand" style={{ width: `${Math.min(100, s.weight * 100 * 1.5)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleCard>
      </div>

      {/* Income */}
      <CollapsibleCard storageKey={`card:etf-detail:${ticker}:income`} title="Income">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Yield (TTM)"         value={detail.yield ? `${(detail.yield * 100).toFixed(2)}%` : "—"} />
          <Stat label="Annual $/share"      value={detail.trailingDividendRate ? `$${fmtNum(detail.trailingDividendRate, 2)}` : "—"} />
          <Stat label="Ex-dividend date"    value={detail.exDividendDate ?? "—"} />
          <Stat label="NAV"                 value={detail.nav ? `$${fmtNum(detail.nav, 2)}` : "—"} />
        </div>
      </CollapsibleCard>

      {/* News */}
      {detail.news.length > 0 && (
        <CollapsibleCard storageKey={`card:etf-detail:${ticker}:news`} title="Recent news">
          <ul className="space-y-2">
            {detail.news.map((n, i) => (
              <li key={i} className="text-sm">
                <a href={n.link} target="_blank" rel="noreferrer" className="text-emerald-700 dark:text-emerald-300 hover:underline">
                  {n.title}
                </a>
                <span className="subtle text-xs ml-2">
                  {n.publisher}{n.providerPublishTime ? ` · ${timeAgo(n.providerPublishTime)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

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

function timeAgo(unixSec: number): string {
  const diff = (Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
