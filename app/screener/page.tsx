import { DashboardHeader } from "@/components/DashboardHeader";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle } from "lucide-react";
import { runScreener } from "@/lib/screener";
import { DisclosureBanner } from "@/components/screener/DisclosureBanner";
import { ThemeMap } from "@/components/screener/ThemeMap";
import { ScreenerTable } from "@/components/screener/ScreenerTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ScreenerPage() {
  let data;
  try {
    data = await runScreener();
  } catch (e: any) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <Card className="border-red-500/30">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="font-semibold">Failed to load screener data</h2>
          </div>
          <p className="text-sm subtle mt-2">{String(e?.message ?? e)}</p>
          <p className="text-xs subtle mt-2">
            The screener fetches live fundamentals + price history from Yahoo Finance. Refresh to retry.
          </p>
        </Card>
      </main>
    );
  }

  const passed = data.rows.filter((r) => r.passedAll).length;
  const total = data.rows.length;
  const highConfidence = data.rows.filter((r) => r.confidence.band === "high").length;
  const mediumConfidence = data.rows.filter((r) => r.confidence.band === "medium").length;

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <DashboardHeader label="Stock Screener" />
      <DisclosureBanner />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">Early-Trend Stock Screener</h1>
            <p className="text-xs subtle mt-0.5">
              {total} tickers across {data.themes.length} secular themes ·
              evaluated {new Date(data.asOf).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">{passed} pass all 3 gates</Badge>
            <Badge variant="info">{highConfidence} high conf</Badge>
            <Badge variant="warn">{mediumConfidence} medium conf</Badge>
          </div>
        </div>
      </Card>

      <CollapsibleCard
        storageKey="card:screener-themes"
        title="Theme map"
        subtitle="9 secular themes — pass counts and conviction-tier distribution"
        summary={
          <p className="text-xs subtle">
            {data.themes.map((t) => `${t.label} ${t.counts.passed}/${t.counts.total}`).join(" · ")}
          </p>
        }
      >
        <ThemeMap themes={data.themes} />
      </CollapsibleCard>

      <CollapsibleCard
        storageKey="card:screener-ranked"
        title="Ranked watchlist"
        subtitle="Sorted by confidence score. Click any row for the gate breakdown."
        summary={<p className="text-xs subtle">{rows1Line(data.rows.slice(0, 8))}</p>}
      >
        <ScreenerTable result={data} />
      </CollapsibleCard>

      <CollapsibleCard
        storageKey="card:screener-methodology"
        title="Methodology"
        subtitle="3-gate pipeline, confidence scoring, tranche splits"
      >
        <div className="space-y-3 text-sm text-ink/90">
          <div>
            <h4 className="font-semibold text-ink mb-1">Gate 1 — Fundamentals (40 points)</h4>
            <p className="text-xs subtle">
              Revenue growth, margins, free cash flow, balance sheet, return on equity.
              Thresholds are <strong>tier-aware</strong>: Core requires positive FCF + 15% rev growth + 45% gross margin;
              Emerging relaxes to 25% rev growth + 35% gross margin (FCF optional); Venture is a sanity check only.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink mb-1">Gate 2 — Moat & Positioning (25 points)</h4>
            <p className="text-xs subtle">
              Manual chokepoint statement (8 pts) anchors why the company is non-optional in its value chain.
              Quantitative proxies: analyst consensus ≤2.5, institutional ownership, coverage breadth, target upside.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink mb-1">Gate 3 — Market Confirmation (20 points)</h4>
            <p className="text-xs subtle">
              Minervini Trend Template — 8 conditions checking that price + 50/150/200-DMA stack is in confirmed Stage-2
              uptrend, within 25% of 52-wk high, RSI 50-80, MACD bullish. Venture names use a 4-condition relaxed variant.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink mb-1">Confidence score (0-100)</h4>
            <p className="text-xs subtle">
              Sum of gates (85) + data quality (10) + market regime (±5). Bands: High ≥75 · Medium 55-74 · Low 35-54 · Watch-only &lt;35.
              In SPY <em>correction</em>, every name is forced to Watch-only regardless of fundamentals — we don&apos;t fight the tape.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink mb-1">Tranche splits (advisory)</h4>
            <p className="text-xs subtle">
              Core <span className="font-mono">50/25/25</span> ·
              Emerging <span className="font-mono">40/30/30</span> ·
              Venture <span className="font-mono">33/33/33</span> —
              tighter staging for higher-uncertainty names.
            </p>
          </div>
        </div>
      </CollapsibleCard>

      <footer className="mt-6 p-4 text-xs subtle border-t border-line">
        <strong className="text-ink/80">Educational use only — not investment advice.</strong>{" "}
        Live fundamentals + price data from Yahoo Finance. Moat anchors are manual; scoring is deterministic.
        Venture-tagged tickers (quantum, frontier biotech) carry materially elevated loss risk.
      </footer>
    </main>
  );
}

function rows1Line(rows: import("@/lib/screener/types").ScreenerRow[]): string {
  return rows.map((r) => `${r.ticker} ${r.confidence.total}`).join(" · ");
}
