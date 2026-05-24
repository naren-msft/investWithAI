import { DashboardHeader } from "@/components/DashboardHeader";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { HelpLink } from "@/components/ui/HelpLink";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { runScreener } from "@/lib/screener";
import type { ScreenerMode } from "@/lib/screener/types";
import { DisclosureBanner } from "@/components/screener/DisclosureBanner";
import { ThemeMap } from "@/components/screener/ThemeMap";
import { ScreenerTable } from "@/components/screener/ScreenerTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams?: { mode?: string; discovery?: string };
}) {
  const modeParam = searchParams?.mode;
  const mode: ScreenerMode | undefined =
    modeParam === "gem" ? "gem" : modeParam === "classic" ? "classic" : undefined;
  const discoveryParam = searchParams?.discovery;
  const discovery = discoveryParam === "on" ? true : discoveryParam === "off" ? false : undefined;

  let data;
  try {
    data = await runScreener({ mode, discovery });
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
  const isGem = data.mode === "gem";
  const otherMode: ScreenerMode = isGem ? "classic" : "gem";

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <DashboardHeader label="Stock Screener" />
      <DisclosureBanner />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-semibold text-ink">
                {isGem ? "Gem Discovery Screener" : "Early-Trend Stock Screener"}
              </h1>
              <HelpLink section="screener-overview" />
            </div>
            <p className="text-xs subtle mt-0.5">
              {total} tickers across {data.themes.length} secular themes ·
              evaluated {new Date(data.asOf).toLocaleString()}
              {data.discoveryUsed ? " · discovery feed on" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-line bg-bg/50 p-0.5 text-xs">
              <Link
                href="/screener?mode=classic"
                className={`px-2 py-1 rounded ${!isGem ? "bg-ink/10 text-ink font-semibold" : "subtle"}`}
              >
                Classic
              </Link>
              <Link
                href="/screener?mode=gem"
                className={`px-2 py-1 rounded ${isGem ? "bg-ink/10 text-ink font-semibold" : "subtle"}`}
              >
                Gem
              </Link>
            </div>
            <Badge variant="success">{passed} pass all 3 gates</Badge>
            <Badge variant="info">{highConfidence} high conf</Badge>
            <Badge variant="warn">{mediumConfidence} medium conf</Badge>
          </div>
        </div>
        {isGem && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-ink/90">
            <strong>Gem mode active.</strong>{" "}
            The scoring rebalances toward early-discovery signals: PEG-based GARP screening,
            EPS revision momentum (PEAD), insider cluster buying (Seyhun 1986), relative strength
            vs SPY, base length, volume thrust, and an inverted analyst-coverage bonus for
            emerging/venture names. Correction-regime veto is softened (only Watch-only when
            fundamentals or moat also fail). Newly-listed tickers route through a post-IPO base
            evaluator.{" "}
            <Link href={`/screener?mode=${otherMode}`} className="underline">Switch to {otherMode}</Link>.
          </div>
        )}
      </Card>

      <CollapsibleCard
        storageKey="card:screener-themes"
        helpSection="screener-themes"
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
        helpSection="screener-confidence"
        title="Ranked watchlist"
        subtitle="Sorted by confidence score. Click any row for the gate breakdown."
        summary={<p className="text-xs subtle">{rows1Line(data.rows.slice(0, 8))}</p>}
      >
        <ScreenerTable result={data} />
      </CollapsibleCard>

      <CollapsibleCard
        storageKey="card:screener-methodology"
        helpSection="screener-overview"
        title="Methodology"
        subtitle={isGem
          ? "3-gate gem screen — rebalanced for early discovery"
          : "3-gate pipeline, confidence scoring, tranche splits"}
      >
        <div className="space-y-3 text-sm text-ink/90">
          <div>
            <h4 className="font-semibold text-ink mb-1">Gate 1 — Fundamentals (40 points)</h4>
            <p className="text-xs subtle">
              {isGem ? (
                <>
                  Gem mode trims the classic FCF/margin/D-E weights to free budget for
                  <strong> PEG (Lynch GARP, up to 5)</strong>,
                  <strong> EPS estimate revision direction (Bernard & Thomas 1989 PEAD, up to 4)</strong>,
                  and a <strong>5-point Piotroski fundamental-quality proxy (up to 6)</strong> —
                  designed to surface compounders that haven&apos;t yet earned consensus attention.
                </>
              ) : (
                <>
                  Revenue growth, margins, free cash flow, balance sheet, return on equity.
                  Thresholds are <strong>tier-aware</strong>: Core requires positive FCF + 15% rev growth + 45% gross margin;
                  Emerging relaxes to 25% rev growth + 35% gross margin (FCF optional); Venture is a sanity check only.
                </>
              )}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink mb-1">Gate 2 — Moat & Positioning (25 points)</h4>
            <p className="text-xs subtle">
              {isGem ? (
                <>
                  Chokepoint (8) + analyst consensus (6) + institutional ownership (4) +
                  <strong> inverted neglect bonus</strong> — emerging/venture names with ≤3 analysts
                  get +3 (Arbel et al. 1983 neglect premium) — plus
                  <strong> insider cluster buying</strong> (Seyhun 1986): ≥3 distinct insider purchasers in 90d earns +4,
                  cross-checked against `netSharePurchaseActivity`.
                </>
              ) : (
                <>
                  Manual chokepoint statement (8 pts) anchors why the company is non-optional in its value chain.
                  Quantitative proxies: analyst consensus ≤2.5, institutional ownership, coverage breadth, target upside.
                </>
              )}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink mb-1">Gate 3 — Market Confirmation (20 points)</h4>
            <p className="text-xs subtle">
              {isGem ? (
                <>
                  Partial Minervini (10) + <strong>relative strength vs SPY</strong> (3, Mansfield/O&apos;Neil) +
                  <strong> frog-in-pan stealth grind</strong> (2, Da/Gurun/Warachka 2014) +
                  <strong> volume thrust</strong> (2, CANSLIM) + <strong>base length</strong> (3 — tighter is better).
                  Post-IPO names (&lt;18 months trading) route through a dedicated 3-check base evaluator
                  (price above IPO low, 20-day momentum, volume thrust).
                </>
              ) : (
                <>
                  Minervini Trend Template — 8 conditions checking that price + 50/150/200-DMA stack is in confirmed Stage-2
                  uptrend, within 25% of 52-wk high, RSI 50-80, MACD bullish. Venture names use a 4-condition relaxed variant.
                </>
              )}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink mb-1">Confidence score (0-100)</h4>
            <p className="text-xs subtle">
              {isGem ? (
                <>
                  Same band cutoffs (75 / 55 / 35) but a <strong>softened regime modifier</strong>:
                  rally +2, neutral 0, pullback +3 (favorable gem entry), correction −2.
                  Correction no longer auto-forces Watch-only unless Gate 1 OR Gate 2 also fails —
                  pullbacks become opportunities for high-conviction discovery names.
                </>
              ) : (
                <>
                  Sum of gates (85) + data quality (10) + market regime (±5). Bands: High ≥75 · Medium 55-74 · Low 35-54 · Watch-only &lt;35.
                  In SPY <em>correction</em>, every name is forced to Watch-only regardless of fundamentals — we don&apos;t fight the tape.
                </>
              )}
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
