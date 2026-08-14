import type { RossThresholds } from "@/config/ross";
import {
  ROSS_LANE_LIMITS,
  ROSS_SCANNER_REGION,
  ROSS_PROFILE,
  watchThresholdsOf,
} from "@/config/ross";
import type { ScreenerProfile } from "@/config/screenerProfile";
import {
  currentMarketSession,
  isSameDayPostCloseResearchWindowEt,
  regularSessionFractionElapsed,
  type MarketSession,
} from "@/lib/marketTime";
import type { RossCandidate } from "./types";

// TradingView public scanner client (keyless, unofficial). Runs several bounded
// "lanes" server-side and unions the results so the displayed universe contains
// BOTH already-qualifying big movers AND early "warming" names (which a single
// change-sorted, capped query would push out). All failure modes (network,
// timeout, shape changes) resolve to an empty lane — callers fall back to Yahoo
// only when EVERY lane errors. Never throws.

const SCANNER_URL = `https://scanner.tradingview.com/${ROSS_SCANNER_REGION}/scan`;
const TIMEOUT_MS = 8000;
/** Shared raw-lane cache TTL. Protects the unofficial endpoint from duplicate
 *  concurrent loads (page SSR + client auto-refresh) hitting it every scan. */
const LANE_CACHE_MS = 20 * 1000;

// Column order requested from the scanner. Indices below must match this list.
const COLUMNS = [
  "name",                            // 0 — ticker symbol
  "description",                     // 1 — company name
  "close",                           // 2 — price
  "change",                          // 3 — daily % change
  "relative_volume_10d_calc",        // 4 — 10-day RVol (coarse pre-filter / fallback)
  "average_volume_30d_calc",         // 5 — 30-day average volume (for true 30d RVol)
  "volume",                          // 6 — today's volume
  "relative_volume_intraday|5",      // 7 — bundle-verified 5m intraday RVOL
  "relative_volume_10d_calc|5",      // 8 — live scanner 5m RVOL (works pre-market)
  "float_shares_outstanding_current",// 9 — float (may be null)
  "market_cap_basic",                // 10 — market cap
  "premarket_change",                // 11 — pre-market % change
  "postmarket_change",               // 12 — post-market (after-hours) % change
] as const;

interface ScannerRow {
  s: string;           // "EXCHANGE:TICKER"
  d: (number | string | null)[];
}
interface ScannerResponse {
  totalCount?: number;
  data?: ScannerRow[];
}

/** Result of a scanner fetch. `ok=false` means the source errored (→ fall back);
 *  `ok=true` with an empty array is a legitimate "no matches". */
export interface TradingViewResult {
  ok: boolean;
  candidates: RossCandidate[];
  laneStatuses: TradingViewLaneStatus[];
}

export interface TradingViewLaneStatus {
  name: TradingViewLaneName;
  ok: boolean;
  count: number;
}

export function laneWarningsOf(statuses: TradingViewLaneStatus[]): string[] {
  return statuses
    .filter((status) => !status.ok)
    .map(
      (status) =>
        `TradingView ${status.name} lane unavailable — results may be incomplete.`,
    );
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function symbolOf(s: string, nameCol: unknown): string {
  // Prefer the plain ticker from the "name" column; fall back to the part after
  // the exchange prefix in `s` (e.g. "NASDAQ:ABCD" → "ABCD").
  if (typeof nameCol === "string" && nameCol.trim()) return nameCol.trim().toUpperCase();
  const parts = String(s).split(":");
  return (parts[1] ?? parts[0] ?? "").toUpperCase();
}

function exchangeOf(s: string): string | null {
  // `s` is "EXCHANGE:TICKER" (e.g. "NASDAQ:ABCD"). Return the exchange prefix.
  const parts = String(s).split(":");
  return parts.length > 1 && parts[0] ? parts[0].toUpperCase() : null;
}

function rowToCandidate(r: ScannerRow): RossCandidate | null {
  const d = r?.d;
  if (!Array.isArray(d)) return null;
  const ticker = symbolOf(r.s, d[0]);
  if (!ticker) return null;
  const name = typeof d[1] === "string" && d[1].trim() ? String(d[1]).trim() : ticker;
  const rvol10 = num(d[4]);
  const avg30 = num(d[5]);
  const volume = num(d[6]);
  const intradayAtTime5m = num(d[7]);
  const intraday5m = num(d[8]);
  // True 30-day relative volume; fall back to the 10-day value if avg30 missing.
  const rvol30 = volume != null && avg30 != null && avg30 > 0 ? volume / avg30 : rvol10;
  return {
    ticker,
    name,
    exchange: exchangeOf(r.s),
    price: num(d[2]),
    changePct: num(d[3]),
    relativeVolume: rvol30,
    // The scanner's explicit `relative_volume_intraday|5` key is bundle-verified,
    // but the public scan often leaves it null / underpowered pre-market on live
    // movers like WETO/LBGJ. `relative_volume_10d_calc|5` is also accepted by the
    // same endpoint and returns the live 5-minute RVOL values those names need.
    rvolIntraday5m:
      intraday5m != null && intraday5m > 0
        ? intraday5m
        : intradayAtTime5m != null && intradayAtTime5m > 0
          ? intradayAtTime5m
          : null,
    avgVolume: avg30,
    volume,
    floatShares: num(d[9]),
    marketCap: num(d[10]),
    premarketChangePct: num(d[11]),
    postmarketChangePct: num(d[12]),
    marketState: null,
    source: "tradingview",
  };
}

type ScannerFilter = { left: string; operation: string; right: unknown };

/** TradingView instrument types allowed in the shared Ross/Large-Cap universe:
 *  common stocks plus US-listed depositary receipts. Exchange gates downstream
 *  still exclude OTC / pink-sheet listings. */
export const TRADINGVIEW_UNIVERSE_TYPES = ["stock", "dr"] as const;

export interface TradingViewScanBody {
  filter: ScannerFilter[];
  options: { lang: "en" };
  markets: string[];
  symbols: {
    query: { types: string[] };
    tickers: string[];
  };
  columns: typeof COLUMNS;
  sort: { sortBy: string; sortOrder: "desc" };
  range: [number, number];
}

export interface TradingViewLaneRequest {
  name: TradingViewLaneStatus["name"];
  body: TradingViewScanBody;
}

interface LaneResult {
  ok: boolean;
  candidates: RossCandidate[];
}

export type TradingViewGapField = "premarket_change" | "postmarket_change";
export type TradingViewLaneName =
  | "qualified"
  | "opening-drive"
  | "watch"
  | "gap";

const _laneCache = new Map<string, { at: number; value: LaneResult }>();
const _laneInFlight = new Map<string, Promise<LaneResult>>();
const OPENING_DRIVE_FRACTION_LIMIT = 60 / 390;

/**
 * Run a single scanner "lane" (a filter + sort + limit). Coalesces concurrent
 * identical requests and caches the raw result briefly so parallel loads share
 * one upstream call. Never throws — errors resolve to { ok:false, candidates:[] }.
 */
export function buildTradingViewScanBody(
  filter: ScannerFilter[],
  sortBy: string,
  limit: number,
): TradingViewScanBody {
  return {
    filter,
    options: { lang: "en" },
    markets: [ROSS_SCANNER_REGION],
    symbols: { query: { types: [...TRADINGVIEW_UNIVERSE_TYPES] }, tickers: [] },
    columns: COLUMNS,
    sort: { sortBy, sortOrder: "desc" },
    range: [0, limit],
  };
}

async function scanLane(body: TradingViewScanBody): Promise<LaneResult> {
  const key = JSON.stringify(body);
  const sortBy = body.sort.sortBy;

  const cached = _laneCache.get(key);
  if (cached && Date.now() - cached.at < LANE_CACHE_MS) return cached.value;

  const inflight = _laneInFlight.get(key);
  if (inflight) return inflight;

  const run = (async (): Promise<LaneResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(SCANNER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; investWithAI/1.0)",
        },
        body: key,
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(`[ross/tradingview] scanner HTTP ${res.status} (sort=${sortBy})`);
        return { ok: false, candidates: [] };
      }
      const json = (await res.json()) as ScannerResponse;
      const rows = json?.data;
      if (!Array.isArray(rows)) return { ok: false, candidates: [] };
      const out: RossCandidate[] = [];
      for (const r of rows) {
        const c = rowToCandidate(r);
        if (c) out.push(c);
      }
      const value: LaneResult = { ok: true, candidates: out };
      _laneCache.set(key, { at: Date.now(), value });
      return value;
    } catch (e: unknown) {
      console.warn(
        `[ross/tradingview] scanner fetch failed (sort=${sortBy}):`,
        e instanceof Error ? e.message : e,
      );
      return { ok: false, candidates: [] };
    } finally {
      clearTimeout(timer);
      _laneInFlight.delete(key);
    }
  })();

  _laneInFlight.set(key, run);
  return run;
}

/** Base filters shared by the qualified + watch lanes (price band + market-cap
 *  floor for the large-cap profile). Change/RVol floors are added per-lane. */
function baseFilters(t: RossThresholds, profile: ScreenerProfile): ScannerFilter[] {
  const f: ScannerFilter[] = [
    { left: "close", operation: "in_range", right: [t.minPrice, t.maxPrice] },
  ];
  if (profile.pillar5Mode === "marketcap-min" && t.minMarketCap > 0) {
    f.push({ left: "market_cap_basic", operation: "egreater", right: t.minMarketCap });
  }
  return f;
}

function shouldRunOpeningDriveLane(
  session: MarketSession,
  at: Date = new Date(),
): boolean {
  if (session !== "regular") return false;
  const frac = regularSessionFractionElapsed(at);
  return frac != null && frac <= OPENING_DRIVE_FRACTION_LIMIT;
}

export function tradingViewGapField(
  session: MarketSession,
  at: Date = new Date(),
): TradingViewGapField | null {
  if (session === "pre-market") return "premarket_change";
  if (session === "after-hours") return "postmarket_change";
  if (session === "closed" && isSameDayPostCloseResearchWindowEt(at)) {
    return "postmarket_change";
  }
  return null;
}

export function buildTradingViewLaneRequests(
  t: RossThresholds,
  profile: ScreenerProfile = ROSS_PROFILE,
  session: MarketSession = currentMarketSession(),
  at: Date = new Date(),
): TradingViewLaneRequest[] {
  const watch = watchThresholdsOf(t);
  const base = baseFilters(t, profile);

  const qualifiedFilter: ScannerFilter[] = [
    ...base,
    { left: "change", operation: "egreater", right: t.minChangePct },
    { left: "relative_volume_10d_calc", operation: "egreater", right: t.minRvol * 0.5 },
  ];
  const openingDriveFilter: ScannerFilter[] = [
    ...base,
    { left: "change", operation: "egreater", right: t.minChangePct },
  ];
  const watchFilter: ScannerFilter[] = [
    ...base,
    { left: "change", operation: "egreater", right: watch.watchChangePct },
    { left: "relative_volume_10d_calc", operation: "egreater", right: watch.watchRvol * 0.5 },
  ];

  const requests: TradingViewLaneRequest[] = [
    {
      name: "qualified",
      body: buildTradingViewScanBody(qualifiedFilter, "change", ROSS_LANE_LIMITS.qualified),
    },
  ];

  // Opening-drive lane — only during the first regular-session hour. It keeps
  // the price/change/profile gates but deliberately drops the coarse full-day
  // RVol pre-filter so names like AAOI can still reach downstream
  // `effectiveRvol(...)`, which applies the authoritative pace-adjusted RVOL.
  if (shouldRunOpeningDriveLane(session, at)) {
    requests.push({
      name: "opening-drive",
      body: buildTradingViewScanBody(
        openingDriveFilter,
        "change",
        ROSS_LANE_LIMITS.openingDrive,
      ),
    });
  }

  requests.push({
    name: "watch",
    body: buildTradingViewScanBody(
      watchFilter,
      "relative_volume_10d_calc",
      ROSS_LANE_LIMITS.watch,
    ),
  });

  // Gap lane — only meaningful while an extended session is active or during
  // the same-day 20:00–24:00 ET post-close research window. Filter on the
  // field for the CURRENT context so we surface true continuation gappers.
  const gapField = tradingViewGapField(session, at);
  if (gapField === "premarket_change") {
    requests.push({
      name: "gap",
      body: buildTradingViewScanBody(
        [...base, { left: "premarket_change", operation: "egreater", right: watch.gapPct }],
        "premarket_change",
        ROSS_LANE_LIMITS.gap,
      ),
    });
  } else if (gapField === "postmarket_change") {
    requests.push({
      name: "gap",
      body: buildTradingViewScanBody(
        [...base, { left: "postmarket_change", operation: "egreater", right: watch.gapPct }],
        "postmarket_change",
        ROSS_LANE_LIMITS.gap,
      ),
    });
  }

  return requests;
}

/**
 * Fetch Ross-style momentum candidates from TradingView across multiple lanes:
 *
 *   1. QUALIFIED — change ≥ minChangePct, coarse 10d-RVol ≥ minRvol×0.5, sorted
 *      by % change desc. The already-moving names (true 30d RVol enforced later).
 *   2. OPENING-DRIVE (first regular-session hour only) — price/change/profile
 *      gates only, sorted by % change desc, with NO coarse full-day RVol gate.
 *      This catches fresh open-drive names whose pace-adjusted RVOL already
 *      qualifies even though their all-day RVOL still lags.
 *   3. WATCH — change ≥ watchChangePct (half the pillar), coarse RVol ≥
 *      watchRvol×0.5, sorted by RELATIVE VOLUME desc. Volume leads price on
 *      early movers, so this surfaces names warming up before they gap.
 *   4. GAP (active extended session, plus the same-day 20:00–24:00 ET
 *      post-close research window) — active pre/after-market change ≥ gapPct,
 *      sorted by that gap desc. Catches names bid up outside regular hours even
 *      when their regular-session change is still small.
 *
 * Lanes run in parallel; results are unioned + deduped by ticker. `ok` is true
 * when ANY lane succeeded (only an all-lane failure triggers the Yahoo
 * fallback). The coarse 10-day RVol pre-filter (half the target) remains a
 * conservative lower bound on the qualified/watch lanes; the true 30d /
 * pace-adjusted RVol floor is still enforced downstream.
 */
export async function fetchTradingViewCandidates(
  t: RossThresholds,
  profile: ScreenerProfile = ROSS_PROFILE,
  session: MarketSession = currentMarketSession(),
  at: Date = new Date(),
): Promise<TradingViewResult> {
  const requests = buildTradingViewLaneRequests(t, profile, session, at);
  const laneNames = requests.map((request) => request.name);
  const lanes = requests.map((request) => scanLane(request.body));

  const results = await Promise.all(lanes);
  const anyOk = results.some((r) => r.ok);
  const laneStatuses: TradingViewLaneStatus[] = results.map((result, index) => ({
    name: laneNames[index],
    ok: result.ok,
    count: result.candidates.length,
  }));

  // Union + dedupe by ticker (first occurrence wins; qualified lane is first).
  const byTicker = new Map<string, RossCandidate>();
  for (const r of results) {
    for (const c of r.candidates) {
      if (!byTicker.has(c.ticker)) byTicker.set(c.ticker, c);
    }
  }

  return {
    ok: anyOk,
    candidates: Array.from(byTicker.values()),
    laneStatuses,
  };
}
