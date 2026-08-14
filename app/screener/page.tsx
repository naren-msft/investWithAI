import { DashboardHeader } from "@/components/DashboardHeader";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { HelpLink } from "@/components/ui/HelpLink";
import { AlertTriangle } from "lucide-react";
import { runScreener } from "@/lib/ross";
import { resolveThresholds, ROSS_DEFAULTS, ROSS_PROFILE } from "@/config/ross";
import { resolveLargecapThresholds, LARGECAP_DEFAULTS, LARGECAP_PROFILE } from "@/config/largecap";
import { DisclosureBanner } from "@/components/screener/DisclosureBanner";
import { RossTable } from "@/components/ross/RossTable";
import { RossControls } from "@/components/ross/RossControls";
import { LargecapControls } from "@/components/ross/LargecapControls";
import { BookTabs } from "@/components/ross/BookTabs";
import {
  extendedDirectionControlCopy,
  risingExtendedLabel,
} from "@/lib/ross/presentation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ScreenerSearchParams {
  book?: string;
  maxPrice?: string;
  minPrice?: string;
  minChange?: string;
  minRvol?: string;
  strongMomentum?: string;
  maxFloat?: string;
  minMarketCap?: string;
  extRising?: string;
}

function fmtUsd(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v)}`;
}

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams?: ScreenerSearchParams;
}) {
  const book: "small" | "large" = searchParams?.book === "large" ? "large" : "small";
  const isLarge = book === "large";

  const thresholds = isLarge
    ? resolveLargecapThresholds({
        maxPrice: searchParams?.maxPrice,
        minPrice: searchParams?.minPrice,
        minChangePct: searchParams?.minChange,
        minRvol: searchParams?.minRvol,
        strongMomentumPct: searchParams?.strongMomentum,
        minMarketCap: searchParams?.minMarketCap,
      })
    : resolveThresholds({
        maxPrice: searchParams?.maxPrice,
        minPrice: searchParams?.minPrice,
        minChangePct: searchParams?.minChange,
        minRvol: searchParams?.minRvol,
        strongMomentumPct: searchParams?.strongMomentum,
        maxFloat: searchParams?.maxFloat,
      });

  const profile = isLarge ? LARGECAP_PROFILE : ROSS_PROFILE;
  const apiPath = isLarge ? "/api/largecap" : "/api/ross";
  // Extended-session direction bias — default ON. Active pre/after-market
  // sessions hard-filter to risers; regular hours retain today's pre-market gap
  // as context/ranking only (pass ?extRising=0 to disable).
  const requireExtendedRising = searchParams?.extRising !== "0";

  let data;
  try {
    data = await runScreener({ thresholds, profile, requireExtendedRising });
  } catch (e: unknown) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <Card className="border-red-500/30">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="font-semibold">Failed to load Screener</h2>
          </div>
          <p className="text-sm subtle mt-2">{String((e as Error)?.message ?? e)}</p>
          <p className="text-xs subtle mt-2">
            The Screener pulls live movers from TradingView (with a Yahoo Finance fallback). Refresh to retry.
          </p>
        </Card>
      </main>
    );
  }

  const total = data.rows.length;
  const fmtFloatM = (n: number) => `${(n / 1_000_000).toFixed(0)}M`;
  const pillar5Summary = isLarge
    ? `mkt cap ≥ ${fmtUsd(thresholds.minMarketCap)}`
    : `float < ${fmtFloatM(thresholds.maxFloat)}`;
  const risingLabel = risingExtendedLabel(data.marketSession, data.asOf);
  const extDirectionCopy = extendedDirectionControlCopy(
    data.marketSession,
    data.asOf,
  );

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <DashboardHeader label="Ross Screener" />
      <DisclosureBanner />

      <Card>
        <div className="mb-3">
          <BookTabs book={book} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-semibold text-ink">
                {isLarge
                  ? "Large-Cap — 5 Pillars (S\u0026P 500 / mega-cap)"
                  : "Ross Screener — 5 Pillars Momentum"}
              </h1>
              <HelpLink section="screener-overview" />
            </div>
            <p className="text-xs subtle mt-0.5">
              {total} live movers ·{" "}
              band ${thresholds.minPrice}–${thresholds.maxPrice} · RVol ≥ {thresholds.minRvol}× ·
              change ≥ +{thresholds.minChangePct}% · {pillar5Summary} ·
              evaluated {new Date(data.asOf).toLocaleString()}
              {" · source: "}
              {data.universeSource === "tradingview" ? "TradingView" : data.universeSource === "yahoo" ? "Yahoo (fallback)" : "none"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">{data.greenCount} pass all automated checks</Badge>
            <Badge variant="warn">{data.watchCount} 🌱 watch (early)</Badge>
            <Badge variant="warn">{data.strongCount} 🔥 strong</Badge>
            <Badge variant="info">{data.risingCount} 📈 {risingLabel}</Badge>
            <Badge variant="success">{data.withNewsCount} 📰 with catalyst</Badge>
            {data.customThresholds && <Badge variant="info">custom thresholds</Badge>}
            <Badge variant={data.requireExtendedRising ? "success" : "warn"}>
              {data.requireExtendedRising
                ? extDirectionCopy.statusEnabled
                : extDirectionCopy.statusDisabled}
            </Badge>
            <Badge variant={data.newsSource.startsWith("Finnhub") ? "success" : "info"}>
              📡 {data.newsSource}
            </Badge>
          </div>
        </div>

        {data.warnings.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-800 dark:text-amber-200">
            {data.warnings.join(" ")}
          </div>
        )}

        <div className="mt-3">
          {isLarge ? (
            <LargecapControls marketSession={data.marketSession} asOf={data.asOf} />
          ) : (
            <RossControls marketSession={data.marketSession} asOf={data.asOf} />
          )}
        </div>
      </Card>

      <CollapsibleCard
        storageKey="card:ross-watchlist"
        helpSection="screener-overview"
        title={isLarge ? "Large-cap watchlist" : "Momentum watchlist"}
        subtitle={
          isLarge
            ? "5 Pillars tuned for large caps — green rows meet every automated pillar. Click a row for the pillar + catalyst-news breakdown."
            : "Ross Cameron 5 Pillars — green rows meet every automated pillar. Click a row for the pillar + catalyst-news breakdown."
        }
        summary={<p className="text-xs subtle">{rows1Line(data.rows.slice(0, 8))}</p>}
      >
        <RossTable result={data} apiPath={apiPath} />
      </CollapsibleCard>

      <CollapsibleCard
        storageKey="card:ross-methodology"
        helpSection="screener-overview"
        title={isLarge ? "Methodology — the 5 Pillars (large-cap tuning)" : "Methodology — the 5 Pillars"}
        subtitle={
          isLarge
            ? "Same structure as the Ross momentum filter, re-tuned for large caps (thresholds adjustable above)"
            : "Ross Cameron / Warrior Trading momentum day-trading criteria (thresholds adjustable above)"
        }
      >
        {isLarge ? <LargecapMethodology /> : <RossMethodology />}
      </CollapsibleCard>

      <footer className="mt-6 p-4 text-xs subtle border-t border-line">
        <strong className="text-ink/80">Educational use only — not investment advice.</strong>{" "}
        Live movers from TradingView (Yahoo Finance fallback); non-negative catalyst news from {data.newsSource}
        {" "}(since the previous market close; unknown timestamps are labeled); extended-hours (pre/after-market) from Yahoo; click a ticker for its
        live TradingView chart.{" "}
        {isLarge
          ? `Large-cap defaults: ${`$${LARGECAP_DEFAULTS.minPrice}–$${LARGECAP_DEFAULTS.maxPrice} price, ${LARGECAP_DEFAULTS.minRvol}× RVol, +${LARGECAP_DEFAULTS.minChangePct}%, mkt cap ≥ ${fmtUsd(LARGECAP_DEFAULTS.minMarketCap)}`}.`
          : `Defaults follow Ross Cameron\u2019s published 5 Pillars (${`$${ROSS_DEFAULTS.minPrice}–$${ROSS_DEFAULTS.maxPrice}, ${ROSS_DEFAULTS.minRvol}× RVol, +${ROSS_DEFAULTS.minChangePct}%, <10M float`}).`}
      </footer>
    </main>
  );
}

function RossMethodology() {
  return (
    <div className="space-y-3 text-sm text-ink/90">
      <Pillar n={1} title="Relative Volume ≥ 5×">
        Today&apos;s volume vs its 30-day average. High RVol confirms real interest and liquidity.
        During pre-market, the screener prefers TradingView&apos;s live 5-minute RVOL when available; regular
        hours keep the session-aware daily basis. The first regular hour also keeps a bounded
        change-sorted discovery lane so pace-adjusted RVol movers are not blocked by lagging
        full-day RVol. (Threshold adjustable.)
      </Pillar>
      <Pillar n={2} title="Daily % change ≥ 10%">
        The stock must already be in motion — demand is present, not hypothetical.
      </Pillar>
      <Pillar n={3} title="News catalyst">
        Breaking news should justify the move (earnings, FDA, contract, partnership). Each row&apos;s
        breakdown lists bullish or neutrally worded headlines since the previous market close while
        excluding clearly negative stories. Timestamp-less results are labeled for manual verification.
        A 🔥 marks names moving ≥ 15% and
        📈 marks positive extended-session context — live in AH/PM when active, or today&apos;s retained pre-market gap during regular hours; <strong>always verify the catalyst yourself</strong>.
      </Pillar>
      <Pillar n={4} title="Price $1–$20 (adjustable)">
        Ross&apos;s small-cap momentum sweet spot. Use the control above to widen to $50, $100, or a custom max.
      </Pillar>
      <Pillar n={5} title="Float < 10M shares">
        Low float creates supply/demand imbalances that fuel explosive intraday moves. When float data is
        unavailable it is flagged <em>N/A</em> (verify on Finviz) rather than failing the pillar — matching the source script.
      </Pillar>
      <GreenNote />
    </div>
  );
}

function LargecapMethodology() {
  return (
    <div className="space-y-3 text-sm text-ink/90">
      <Pillar n={1} title="Relative Volume ≥ 1.5×">
        Today&apos;s volume vs its 30-day average. Large caps rarely spike 5× like small caps, so the bar
        is lower — but elevated RVol still confirms unusual interest. During pre-market, the screener
        prefers TradingView&apos;s live 5-minute RVOL when available; regular hours keep the
        session-aware daily basis. The first regular hour also keeps a bounded change-sorted
        discovery lane so pace-adjusted RVol movers are not blocked by lagging full-day RVol.
        (Threshold adjustable.)
      </Pillar>
      <Pillar n={2} title="Daily % change ≥ 3%">
        A meaningful move for a mega-cap. The stock must already be in motion — demand is present, not hypothetical.
      </Pillar>
      <Pillar n={3} title="News catalyst">
        Breaking news should justify the move (earnings, guidance, upgrade, contract, M&amp;A). Each row&apos;s
        breakdown lists bullish or neutrally worded headlines since the previous market close while
        excluding clearly negative stories. Timestamp-less results are labeled for manual verification.
        A 🔥 marks names moving ≥ 5% and
        📈 marks positive extended-session context — live in AH/PM when active, or today&apos;s retained pre-market gap during regular hours; <strong>always verify the catalyst yourself</strong>.
      </Pillar>
      <Pillar n={4} title="Price $10–$100,000 (adjustable)">
        Effectively no upper cap — large caps trade across a wide price range. Use the control above to narrow the band.
      </Pillar>
      <Pillar n={5} title="Large cap: market cap ≥ $10B">
        The large-cap floor (replaces Ross&apos;s &lt;10M-share float pillar). Bigger, more liquid names with
        deep institutional ownership. Adjust to $50B / $200B / $1T to focus on mega-caps.
      </Pillar>
      <GreenNote />
    </div>
  );
}

function GreenNote() {
  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
      <strong className="text-emerald-700 dark:text-emerald-300">Green background = all automated pillars met.</strong>{" "}
      It is a scan signal, not a buy signal — confirm the news catalyst (Pillar 3) and your risk plan first.
    </div>
  );
}

function Pillar({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-ink mb-1">
        {n}️⃣ {title}
      </h4>
      <p className="text-xs subtle">{children}</p>
    </div>
  );
}

function rows1Line(rows: import("@/lib/ross/types").RossRow[]): string {
  return rows
    .map((r) => `${r.ticker} ${r.currentChangePct != null ? (r.currentChangePct > 0 ? "+" : "") + r.currentChangePct.toFixed(0) + "%" : ""}`)
    .join(" · ");
}
