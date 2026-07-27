import {
  ROSS_CACHE_MS,
  ROSS_NEWS_LOOKBACK_MS,
  ROSS_US_EXCHANGES,
  ROSS_PROFILE,
  isCustomThresholds,
  resolveThresholds,
  type RossThresholds,
  type RossThresholdOverrides,
} from "@/config/ross";
import type { ScreenerProfile } from "@/config/screenerProfile";
import type { RossCandidate, RossResult, RossRow, RossSource } from "./types";
import { fetchTradingViewCandidates } from "./tradingview";
import { fetchYahooCandidates, enrichFloat } from "./yahooFallback";
import { fetchExtendedHours, extendedRisingOf } from "./extendedHours";
import { evaluatePillars } from "./pillars";
import { fetchRossNews, activeNewsSourceLabel } from "./news";
import { recordScreenerRows, type ScreenerBook } from "./history";

// Orchestrates the Ross Cameron 5 Pillars screen:
//   1. Pull candidates (TradingView primary → Yahoo fallback).
//   2. Enrich missing float via Yahoo (best effort).
//   3. Evaluate the 5 pillars against the resolved thresholds.
//   4. Attach catalyst news published since the previous market close.
//   5. Sort green-first, then by daily % change.
// Cached 5 min, keyed by the resolved thresholds.

const _cache = new Map<string, { at: number; value: RossResult }>();

/** Hard cap on cached threshold/profile combinations. Arbitrary decimal query
 *  params could otherwise grow the map without bound. */
const _CACHE_MAX_ENTRIES = 200;

/** Read a fresh cache entry, deleting it if expired. */
function cacheGet(key: string): RossResult | null {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at >= ROSS_CACHE_MS) {
    _cache.delete(key);
    return null;
  }
  // Refresh LRU recency: re-insert so it moves to the end of the Map order.
  _cache.delete(key);
  _cache.set(key, hit);
  return hit.value;
}

/** Store an entry, evicting the oldest when over the size cap. */
function cacheSet(key: string, value: RossResult): void {
  _cache.set(key, { at: Date.now(), value });
  while (_cache.size > _CACHE_MAX_ENTRIES) {
    const oldest = _cache.keys().next().value;
    if (oldest === undefined) break;
    _cache.delete(oldest);
  }
}

export interface RunRossOptions {
  thresholds?: RossThresholds;
  overrides?: RossThresholdOverrides;
  /** Screener profile (Ross small-cap default, or Large-cap). */
  profile?: ScreenerProfile;
  /** Skip the in-memory result cache and force a fresh upstream scan. Used by
   *  the manual "Refresh" button (?fresh=1) so the user can always pull a live
   *  universe on demand, regardless of cache age. */
  bypassCache?: boolean;
  /** Require the candidate to be RISING in the active extended-hours session
   *  (after-hours / pre-market). Drops names fading post-close even if their
   *  regular-session pillars pass. Unknown extended data is tolerated. */
  requireExtendedRising?: boolean;
}

function cacheKey(t: RossThresholds, profile: ScreenerProfile, extRising: boolean): string {
  return [
    profile.id,
    extRising ? "extR" : "all",
    t.minRvol,
    t.minChangePct,
    t.strongMomentumPct,
    t.minPrice,
    t.maxPrice,
    t.maxFloat,
    t.minMarketCap,
  ].join(":");
}

function googleFinanceUrl(ticker: string): string {
  // Google Finance has no API — link out for manual research. Default to NASDAQ;
  // the page redirects/searches correctly even when the exchange guess is off.
  return `https://www.google.com/finance/quote/${encodeURIComponent(ticker)}:NASDAQ`;
}

/** Build the "EXCHANGE:TICKER" symbol TradingView charts understand. */
function tradingViewSymbol(ticker: string, exchange: string | null): string {
  return exchange ? `${exchange}:${ticker}` : ticker;
}

/** Deep link to the TradingView chart for a symbol (opens the latest chart). */
function chartUrl(tvSymbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
}

/**
 * Hard qualifying filter — the displayed universe should contain only names that
 * meet the AUTOMATED, data-available pillars, regardless of source (TradingView
 * filters server-side; the Yahoo fallback does not). Price + daily change must
 * be present and in range; RVol (true 30-day) must meet the threshold when
 * known. Float is NOT filtered here — unknown float is tolerated (Pillar 5 N/A).
 */
function meetsAutomatedPillars(c: RossCandidate, t: RossThresholds, profile: ScreenerProfile): boolean {
  // US-listed only — exclude OTC / pink-sheet and other non-primary venues.
  // A null exchange (Yahoo fallback, already US-scoped) is tolerated.
  if (c.exchange != null && !ROSS_US_EXCHANGES.has(c.exchange.toUpperCase())) return false;
  if (c.price == null || c.price < t.minPrice || c.price > t.maxPrice) return false;
  if (c.changePct == null || c.changePct < t.minChangePct) return false;
  if (c.relativeVolume == null || c.relativeVolume < t.minRvol) return false;
  // Large-cap profile: enforce the market-cap floor (Pillar 5) on the displayed
  // universe. A missing market cap cannot confirm the large-cap floor, so it is
  // excluded — keeping the Yahoo-fallback universe consistent with TradingView's
  // server-side market_cap_basic filter.
  if (profile.pillar5Mode === "marketcap-min" && t.minMarketCap > 0) {
    if (c.marketCap == null || c.marketCap < t.minMarketCap) return false;
  }
  return true;
}

export async function runRoss(opts: RunRossOptions = {}): Promise<RossResult> {
  const profile = opts.profile ?? ROSS_PROFILE;
  const thresholds = opts.thresholds ?? resolveThresholds(opts.overrides ?? {}, profile.defaults);
  const key = cacheKey(thresholds, profile, !!opts.requireExtendedRising);
  if (!opts.bypassCache) {
    const cachedValue = cacheGet(key);
    if (cachedValue) return cachedValue;
  }

  const warnings: string[] = [];

  // 1. Candidate universe — TradingView primary. Fall back to Yahoo ONLY when
  //    the scanner actually errored (ok=false), not on a legitimate empty set.
  let universeSource: RossSource | "none" = "none";
  const tv = await fetchTradingViewCandidates(thresholds, profile);
  let candidates = tv.candidates;
  if (tv.ok) {
    universeSource = candidates.length > 0 ? "tradingview" : "none";
  } else {
    warnings.push("TradingView scanner unavailable — using Yahoo fallback.");
    candidates = await fetchYahooCandidates(profile.yahooScreenerIds);
    if (candidates.length > 0) universeSource = "yahoo";
  }

  // Dedupe by ticker + enforce the qualifying (automated) pillars so the shown
  // universe is source-independent.
  const byTicker = new Map<string, RossCandidate>();
  for (const c of candidates) {
    if (!byTicker.has(c.ticker) && meetsAutomatedPillars(c, thresholds, profile)) byTicker.set(c.ticker, c);
  }
  let deduped = Array.from(byTicker.values());

  // 2. Float enrichment — for every displayed candidate missing float (common on
  //    the Yahoo path, or when TV omits it). Best-effort; enrichFloat batches.
  const needFloat = deduped.filter((c) => c.floatShares == null).map((c) => c.ticker);
  if (needFloat.length > 0) {
    const floatMap = await enrichFloat(needFloat);
    deduped = deduped.map((c) =>
      c.floatShares == null && floatMap.has(c.ticker)
        ? { ...c, floatShares: floatMap.get(c.ticker) ?? null }
        : c,
    );
  }

  // 2b. Extended-hours + exchange enrichment. TradingView already supplies
  //     pre/post-market change directly (columns 9/10); Yahoo's keyless quote
  //     is a cross-check/fallback that also gives marketState. We keep whichever
  //     source has data (TradingView first, Yahoo fills gaps), so a name fading
  //     after-hours is caught even if one source is missing that field.
  const extMap = await fetchExtendedHours(deduped.map((c) => c.ticker).slice(0, 60));
  deduped = deduped.map((c) => {
    const ext = extMap.get(c.ticker);
    if (!ext) return c;
    return {
      ...c,
      exchange: c.exchange ?? ext.exchange,
      marketState: ext.marketState,
      premarketChangePct: c.premarketChangePct ?? ext.premarketChangePct,
      postmarketChangePct: c.postmarketChangePct ?? ext.postmarketChangePct,
    };
  });

  // 2c. Extended-hours direction gate — Ross "gap and go" wants CONTINUATION:
  //     names that are UP in the active after-hours / pre-market session, not
  //     fading. When enabled, drop candidates whose KNOWN active extended-session
  //     change is <= 0 (falling/flat). Unknown extended data is tolerated (kept)
  //     — we never penalize genuinely-missing data (same policy as float N/A).
  if (opts.requireExtendedRising) {
    deduped = deduped.filter((c) => {
      const ext = extendedRisingOf(c);
      return ext.pct == null || ext.pct > 0;
    });
  }

  // 3. Evaluate pillars.
  const evaluated = deduped.map((candidate) => {
    const ev = evaluatePillars(candidate, thresholds, profile);
    return { candidate, ev };
  });

  // 4. Latest positive catalyst news within the rolling catalyst window.
  const newsSince = new Date(Date.now() - ROSS_NEWS_LOOKBACK_MS);
  const newsMap = await fetchRossNews(
    evaluated.map((e) => e.candidate.ticker),
    newsSince,
  );

  // 5. Assemble + sort (green first, then change% desc, then RVol desc).
  const rows: RossRow[] = evaluated.map(({ candidate, ev }) => {
    const ext = extendedRisingOf(candidate);
    const tvSymbol = tradingViewSymbol(candidate.ticker, candidate.exchange);
    return {
      ticker: candidate.ticker,
      name: candidate.name,
      candidate,
      pillars: ev.pillars,
      allAutomatedMet: ev.allAutomatedMet,
      strongMomentum: ev.strongMomentum,
      floatUnknown: ev.floatUnknown,
      extendedRising: ext.rising,
      extendedChangePct: ext.pct,
      extendedSession: ext.session,
      tradingViewSymbol: tvSymbol,
      chartUrl: chartUrl(tvSymbol),
      news: newsMap.get(candidate.ticker) ?? [],
      googleFinanceUrl: googleFinanceUrl(candidate.ticker),
    };
  });

  rows.sort((a, b) => {
    if (a.allAutomatedMet !== b.allAutomatedMet) return a.allAutomatedMet ? -1 : 1;
    // Ross "gap-and-go" quality: extended-hours rising + a positive catalyst.
    const setup = (r: RossRow) => (r.extendedRising ? 2 : 0) + (r.news.length > 0 ? 1 : 0);
    const sb = setup(b) - setup(a);
    if (sb !== 0) return sb;
    const ca = a.candidate.changePct ?? -Infinity;
    const cb = b.candidate.changePct ?? -Infinity;
    if (cb !== ca) return cb - ca;
    const ra = a.candidate.relativeVolume ?? -Infinity;
    const rb = b.candidate.relativeVolume ?? -Infinity;
    return rb - ra;
  });

  const asOf = new Date().toISOString();

  // Persist this scan into today's screener history and annotate each row with
  // the ticker's first-seen time so the UI can show "first seen HH:MM ET".
  // Best-effort — a failure here must never break the screener.
  try {
    const book: ScreenerBook = profile.id === "largecap" ? "largecap" : "ross";
    const dayMap = await recordScreenerRows(book, rows, asOf);
    for (const r of rows) r.firstSeenAt = dayMap[r.ticker]?.firstSeenAt ?? asOf;
  } catch {
    for (const r of rows) r.firstSeenAt = asOf;
  }

  const result: RossResult = {
    asOf,
    newsSince: newsSince.toISOString(),
    newsSource: activeNewsSourceLabel(),
    thresholds,
    customThresholds: isCustomThresholds(thresholds, profile.defaults),
    universeSource,
    requireExtendedRising: !!opts.requireExtendedRising,
    rows,
    greenCount: rows.filter((r) => r.allAutomatedMet).length,
    strongCount: rows.filter((r) => r.strongMomentum).length,
    risingCount: rows.filter((r) => r.extendedRising).length,
    withNewsCount: rows.filter((r) => r.news.length > 0).length,
    warnings,
  };

  cacheSet(key, result);
  return result;
}

/** Profile-explicit alias for {@link runRoss} (reads better at call sites that
 *  pass a non-Ross profile, e.g. the large-cap screener). */
export const runScreener = runRoss;
