import {
  ROSS_CACHE_MS,
  ROSS_PROFILE,
  isCustomThresholds,
  resolveThresholds,
  watchThresholdsOf,
  type RossThresholds,
  type RossThresholdOverrides,
} from "@/config/ross";
import type { ScreenerProfile } from "@/config/screenerProfile";
import {
  currentMarketSession,
  isSameDayPostCloseResearchWindowEt,
  previousTradingClose,
  regularSessionFractionElapsed,
} from "@/lib/marketTime";
import type { RossCandidate, RossResult, RossRow, RossSource } from "./types";
import { fetchTradingViewCandidates, laneWarningsOf } from "./tradingview";
import { fetchYahooCandidates, enrichFloat } from "./yahooFallback";
import { fetchExtendedHours, extendedRisingOf } from "./extendedHours";
import { evaluatePillars } from "./pillars";
import { fetchRossNews, activeNewsSourceLabel } from "./news";
import {
  recordAlignmentSnapshots,
  recordScreenerRows,
  type ScreenerBook,
} from "./history";
import {
  classifyStage,
  effectiveChangePct,
  effectivePrice,
  effectiveRvol,
  passesUniverse,
} from "./classification";
import { buildSignalAlignment } from "./alignment";
import { settleAlignmentOutcomes } from "./outcomes";

// Orchestrates the Ross Cameron 5 Pillars screen:
//   1. Pull candidates (TradingView primary → Yahoo fallback).
//   2. Enrich missing float via Yahoo (best effort).
//   3. Evaluate the 5 pillars against the resolved thresholds.
//   4. Attach catalyst news published since the previous market close.
//   5. Sort green-first, then by daily % change.
// Cached briefly, keyed by the resolved thresholds.

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

function cacheKey(
  t: RossThresholds,
  profile: ScreenerProfile,
  extRising: boolean,
  marketContext: string,
): string {
  return [
    profile.id,
    marketContext,
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

export async function runRoss(opts: RunRossOptions = {}): Promise<RossResult> {
  const profile = opts.profile ?? ROSS_PROFILE;
  const thresholds = opts.thresholds ?? resolveThresholds(opts.overrides ?? {}, profile.defaults);
  const asOfDate = new Date();
  const session = currentMarketSession(asOfDate);
  const postCloseResearchWindow =
    session === "closed" && isSameDayPostCloseResearchWindowEt(asOfDate);
  const key = cacheKey(
    thresholds,
    profile,
    !!opts.requireExtendedRising,
    postCloseResearchWindow ? "closed-postclose" : session,
  );
  if (!opts.bypassCache) {
    const cachedValue = cacheGet(key);
    if (cachedValue) return cachedValue;
  }

  const rossDebug = process.env.ROSS_DEBUG === "true";
  const warnings: string[] = [];
  const watch = watchThresholdsOf(thresholds);

  // 1. Candidate universe — TradingView primary (multi-lane: qualified + watch +
  //    extended-gap). Fall back to Yahoo ONLY when every lane errored (ok=false),
  //    not on a legitimate empty set.
  let universeSource: RossSource | "none" = "none";
  const tv = await fetchTradingViewCandidates(thresholds, profile, session, asOfDate);
  let candidates = tv.candidates;
  if (tv.ok) {
    universeSource = candidates.length > 0 ? "tradingview" : "none";
    warnings.push(...laneWarningsOf(tv.laneStatuses));
  } else {
    warnings.push("TradingView scanner unavailable — using Yahoo fallback.");
    candidates = await fetchYahooCandidates(profile.yahooScreenerIds);
    if (candidates.length > 0) universeSource = "yahoo";
  }
  const rawCount = candidates.length;

  // Dedupe by ticker + enforce ONLY the shared universe gate (US exchange, price
  // band, market-cap floor). The change/RVol TIER (qualified vs watch) is decided
  // AFTER enrichment so the extended-gap case can see pre/after-market data.
  const byTicker = new Map<string, RossCandidate>();
  for (const c of candidates) {
    if (!byTicker.has(c.ticker) && passesUniverse(c, thresholds, profile, session, asOfDate)) {
      byTicker.set(c.ticker, c);
    }
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

  // 2b. Extended-hours + exchange enrichment for the WHOLE bounded union (lane
  //     limits keep it ≈ a single Yahoo batch). TradingView already supplies
  //     pre/post-market change (scanner columns 11/12); Yahoo's keyless quote is a
  //     cross-check/fallback that also gives marketState. We keep whichever
  //     source has data (TradingView first, Yahoo fills gaps).
  const extMap = await fetchExtendedHours(deduped.map((c) => c.ticker));
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

  // 2b². Time-of-day normalized RVol (REGULAR session only). Full-day RVol lags
  //      early in the session (a name can be up 8× its usual first-30-min volume
  //      while its full-day RVol still reads ~1×). intradayRvol = volume /
  //      (avgDailyVolume × sessionFractionElapsed), with the fraction floored so
  //      the first few minutes don't explode the ratio. Premarket must NOT use
  //      the fraction=0 basis — it relies on TradingView's vendor 5m RVOL via
  //      `effectiveRvol(...)`.
  if (session === "regular") {
    const frac = regularSessionFractionElapsed(asOfDate);
    if (frac != null) {
      const f = Math.max(frac, 0.02);
      deduped = deduped.map((c) => {
        if (c.volume == null || c.avgVolume == null || c.avgVolume <= 0) return c;
        return { ...c, intradayRvol: c.volume / (c.avgVolume * f) };
      });
    }
  }

  // 2c. Tier classification — qualified (all pillars) vs watch (early/warming) vs
  //     drop. Runs AFTER enrichment so a small-change name gapping in the active
  //     extended session is still caught as "watch".
  const classified = deduped.map((c) => ({
    c,
    stage: classifyStage(c, thresholds, watch, profile, session, asOfDate),
  }));
  if (rossDebug) {
    console.debug(`[ross/debug] raw=${rawCount} universe=${deduped.length}`);
    for (const { c, stage } of classified) {
      const rvol = effectiveRvol(c, session, asOfDate);
      console.debug(
        `[ross/debug] classify ${c.ticker}: stage=${stage ?? "dropped"} ` +
          `changePct=${c.changePct?.toFixed(1) ?? "—"} ` +
          `rvol=${rvol?.toFixed(1) ?? "—"} ` +
          `full=${c.relativeVolume?.toFixed(1) ?? "—"} ` +
          `5m=${c.rvolIntraday5m?.toFixed(1) ?? "—"}`,
      );
    }
  }
  const staged = classified.filter(
    (entry): entry is { c: RossCandidate; stage: "qualified" | "watch" } =>
      entry.stage != null,
  );

  // 2d. Extended-hours direction gate — Ross "gap and go" wants CONTINUATION.
  //     Applied as a HARD filter ONLY during an active extended session (pre /
  //     after-market) or the same-day 20:00–24:00 ET post-close research
  //     window: drop names whose KNOWN active-session change is <= 0. During
  //     regular hours the (now-stale) pre-market reading must NOT hide a strong
  //     intraday mover, so extended direction is a RANKING signal only (see
  //     sort below). Unknown extended data is always tolerated.
  const hardExtGate =
    !!opts.requireExtendedRising &&
    (session === "pre-market" || session === "after-hours" || postCloseResearchWindow);
  const gated = hardExtGate
    ? staged.filter(({ c }) => {
        const ext = extendedRisingOf(c, asOfDate);
        return ext.pct == null || ext.pct > 0;
      })
    : staged;
  if (rossDebug) {
    console.debug(`[ross/debug] staged=${staged.length} gated=${gated.length}`);
  }

  // 3. Evaluate pillars.
  const evaluated = gated.map(({ c: candidate, stage }) => {
    const currentPrice = effectivePrice(candidate, session, asOfDate);
    const currentChangePct = effectiveChangePct(candidate, session, asOfDate);
    const currentRvol = effectiveRvol(candidate, session, asOfDate);
    const ev = evaluatePillars(
      candidate,
      thresholds,
      profile,
      currentPrice,
      currentChangePct,
      currentRvol,
    );
    return { candidate, ev, stage, currentPrice, currentChangePct, currentRvol };
  });

  // 4. Latest non-negative catalyst news since the PREVIOUS market close — a
  //     session-aware window that spans weekends/holidays (so Monday pre-market
  //     still sees Friday-evening catalysts) instead of a fixed rolling lookback.
  const newsSince = previousTradingClose(asOfDate);
  const newsMap = await fetchRossNews(
    evaluated.map((e) => e.candidate.ticker),
    newsSince,
  );

  // 5. Assemble + sort (qualified first, then setup quality, then change% / RVol).
  const rows: RossRow[] = evaluated.map(
    ({ candidate, ev, stage, currentPrice, currentChangePct, currentRvol }) => {
      const ext = extendedRisingOf(candidate, asOfDate);
      const tvSymbol = tradingViewSymbol(candidate.ticker, candidate.exchange);
      return {
        ticker: candidate.ticker,
        name: candidate.name,
        candidate,
        currentPrice,
        currentChangePct,
        currentRvol,
        stage,
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
    },
  );

  const asOf = asOfDate.toISOString();
  const book: ScreenerBook = profile.id === "largecap" ? "largecap" : "ross";
  const signalAlignmentEnabled = profile.id === "ross";

  // Persist this scan into today's history BEFORE sorting, then annotate each row
  // with first-seen time, acceleration deltas (#1) and watch→qualified lead time
  // (#5). Recording first lets us read back the PREVIOUS reading to compute the
  // RVol/change deltas the sort then uses. Best-effort — must never break the scan.
  try {
    const dayMap = await recordScreenerRows(book, rows, asOf);
    for (const r of rows) {
      const h = dayMap[r.ticker];
      r.firstSeenAt = h?.firstSeenAt ?? asOf;
      r.seenCount = h?.seenCount ?? 1;
      r.peakChangePct = h?.peakChangePct ?? r.currentChangePct ?? null;
      r.peakExtendedPct = h?.peakExtendedPct ?? r.extendedChangePct ?? null;

      // #1 acceleration — deltas vs the previous recorded reading (may be null on
      // the first sighting or before the min gap has elapsed).
      const prevRvol = h?.prevRvol ?? null;
      const lastRvol = h?.lastRvol ?? r.currentRvol ?? null;
      const prevChg = h?.prevChangePct ?? null;
      const lastChg = h?.lastChangePct ?? r.currentChangePct ?? null;
      r.rvolDelta = prevRvol != null && lastRvol != null ? lastRvol - prevRvol : null;
      r.changeDelta = prevChg != null && lastChg != null ? lastChg - prevChg : null;
      // RVol-weighted acceleration score (volume leads price on early movers).
      r.accelScore =
        r.rvolDelta != null || r.changeDelta != null
          ? (r.rvolDelta ?? 0) + 0.1 * (r.changeDelta ?? 0)
          : null;

      // #5 lead time — minutes spent on "watch" before first qualifying today.
      r.firstWatchAt = h?.firstWatchAt ?? null;
      r.firstQualifiedAt = h?.firstQualifiedAt ?? null;
      r.watchLeadMin =
        r.firstWatchAt &&
        r.firstQualifiedAt &&
        Date.parse(r.firstQualifiedAt) > Date.parse(r.firstWatchAt)
          ? (Date.parse(r.firstQualifiedAt) - Date.parse(r.firstWatchAt)) / 60000
          : null;
      r.signalAlignment = signalAlignmentEnabled
        ? buildSignalAlignment(r, h, session, newsSince.toISOString(), asOf)
        : null;
    }
    if (signalAlignmentEnabled) {
      await recordAlignmentSnapshots(book, rows, asOf, session);
      void settleAlignmentOutcomes(book, asOf).catch(() => {});
    }
  } catch {
    for (const r of rows) {
      r.firstSeenAt = asOf;
      r.signalAlignment = signalAlignmentEnabled
        ? buildSignalAlignment(
            r,
            undefined,
            session,
            newsSince.toISOString(),
            asOf,
          )
        : null;
    }
  }

  rows.sort((a, b) => {
    // Detection tier first: qualified (green) above early "watch" rows.
    const stageRank = (r: RossRow) => (r.stage === "qualified" ? 0 : 1);
    const sr = stageRank(a) - stageRank(b);
    if (sr !== 0) return sr;

    if (a.stage === "qualified") {
      // Qualified block: green quality — all-pillars, then extended-rising +
      // catalyst setup, then change% desc, then RVol desc.
      if (a.allAutomatedMet !== b.allAutomatedMet) return a.allAutomatedMet ? -1 : 1;
      const setup = (r: RossRow) => (r.extendedRising ? 2 : 0) + (r.news.length > 0 ? 1 : 0);
      const sb = setup(b) - setup(a);
      if (sb !== 0) return sb;
      const ca = a.currentChangePct ?? -Infinity;
      const cb = b.currentChangePct ?? -Infinity;
      if (cb !== ca) return cb - ca;
      const ra = a.currentRvol ?? -Infinity;
      const rb = b.currentRvol ?? -Infinity;
      return rb - ra;
    }

    // Watch block: acceleration first (fastest-warming names bubble up), then
    // effective RVol (max of full-day + intraday) — volume leads price on early
    // movers — then extended-rising + catalyst setup, then change% desc.
    const aa = a.accelScore ?? 0;
    const ab = b.accelScore ?? 0;
    if (ab !== aa) return ab - aa;
    const ra = a.currentRvol ?? -Infinity;
    const rb = b.currentRvol ?? -Infinity;
    if (rb !== ra) return rb - ra;
    const setup = (r: RossRow) => (r.extendedRising ? 2 : 0) + (r.news.length > 0 ? 1 : 0);
    const sb = setup(b) - setup(a);
    if (sb !== 0) return sb;
    const ca = a.currentChangePct ?? -Infinity;
    const cb = b.currentChangePct ?? -Infinity;
    return cb - ca;
  });

  // Assemble the result.
  const result: RossResult = {
    asOf,
    newsSince: newsSince.toISOString(),
    newsSource: activeNewsSourceLabel(),
    thresholds,
    customThresholds: isCustomThresholds(thresholds, profile.defaults),
    universeSource,
    marketSession: session,
    requireExtendedRising: !!opts.requireExtendedRising,
    signalAlignmentEnabled,
    rows,
    greenCount: rows.filter((r) => r.allAutomatedMet).length,
    watchCount: rows.filter((r) => r.stage === "watch").length,
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
