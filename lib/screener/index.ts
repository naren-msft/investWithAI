import YahooFinance from "yahoo-finance2";
import { getHistory } from "@/lib/yahoo";
import { detectRegime } from "@/lib/regime";
import {
  THEMES,
  allScreenerTickers,
  findPrimaryTheme,
  type ThemeKey,
  type ThemeTicker,
  type Theme,
} from "@/config/screener-themes";
import type { ScreenerFundamentals, ScreenerMode, ScreenerResult, ScreenerRow } from "./types";
import { evaluateFundamentals } from "./fundamentals";
import { evaluateMoat } from "./moat";
import { computeTrend, computeEarlyTrend, evaluateTrend } from "./trend";
import { computeConfidence } from "./score";
import { getDiscoveryTickers, isDiscoveryEnabled, buildDiscoveryTheme } from "./discovery";

const yahooFinance = new YahooFinance();
// @ts-ignore
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

const CACHE_MS = 5 * 60 * 1000;
const _cache = new Map<string, { at: number; value: ScreenerResult }>();

const EARLY_IPO_DAYS = 540;  // ≤ 18 months of trading triggers early-IPO branch

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx]);
      } catch (e) {
        results[idx] = e as R;
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function numOrNull(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && typeof v.raw === "number") return v.raw;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function emptyFundamentals(): ScreenerFundamentals {
  return {
    revenueGrowth: null, earningsGrowth: null, grossMargins: null, operatingMargins: null,
    profitMargins: null, freeCashflow: null, debtToEquity: null, returnOnEquity: null,
    earningsQuarterlyGrowth: null, recommendationMean: null, numberOfAnalystOpinions: null,
    targetMeanPrice: null, institutionsPercentHeld: null, insidersPercentHeld: null,
    marketCap: null, trailingPE: null, forwardPE: null, pegRatio: null,
    shortPercentOfFloat: null, shortRatio: null, beta: null, sandp52WeekChange: null,
    floatShares: null, sharesOutstanding: null, firstTradeDateMs: null,
    epsRevisionDir: null, insiderClusterCount: null, netInsiderShares: null, piotroskiProxy: null,
  };
}

// Conservative insider purchase classifier — only counts transactions whose
// text indicates a clear open-market purchase. Excludes option exercises,
// awards, grants, gifts, and sales. Combined with a 90-day window filter.
const PURCHASE_TEXT = /\bpurchase\b|\bbuy\b/i;
const SKIP_TEXT = /\bsale\b|\boption exercise\b|\bexercise\b|\baward\b|\bgrant\b|\bgift\b|\bconversion\b|disposit/i;

function classifyInsiderCluster(insiderTransactions: any): { count: number; net: number | null } {
  const txns: any[] = insiderTransactions?.transactions ?? [];
  if (!Array.isArray(txns) || txns.length === 0) return { count: 0, net: null };
  const cutoff = Date.now() - 90 * 86400000;
  const buyers = new Set<string>();
  for (const t of txns) {
    const text = String(t?.transactionText ?? "");
    if (SKIP_TEXT.test(text)) continue;
    if (!PURCHASE_TEXT.test(text)) continue;
    const dateMs = t?.startDate instanceof Date
      ? t.startDate.getTime()
      : (typeof t?.startDate === "number" ? (t.startDate < 1e12 ? t.startDate * 1000 : t.startDate) : NaN);
    if (!Number.isFinite(dateMs) || dateMs < cutoff) continue;
    const name = String(t?.filerName ?? "").trim();
    if (name) buyers.add(name);
  }
  return { count: buyers.size, net: null };
}

// EPS revision direction — sign of (current-year mean estimate − estimate 30d ago).
function classifyEpsRevisions(earningsTrend: any): number | null {
  const trend: any[] = earningsTrend?.trend ?? [];
  if (!Array.isArray(trend) || trend.length === 0) return null;
  // Prefer +1y (next fiscal year) since it's the most-followed forward number;
  // fall back to 0y (current year) if +1y is missing.
  const period = trend.find((t) => t?.period === "+1y") ?? trend.find((t) => t?.period === "0y");
  if (!period) return null;
  const eps = period?.epsTrend ?? {};
  const cur = numOrNull(eps?.current);
  const prev = numOrNull(eps?.["30daysAgo"]);
  if (cur == null || prev == null) return null;
  if (cur > prev) return 1;
  if (cur < prev) return -1;
  return 0;
}

// 5-point Piotroski proxy from balance/income/cashflow history (annual).
// Each check awards 1 point.
function computePiotroskiProxy(
  fund: ScreenerFundamentals,
  cashflowHistory: any,
  balanceHistory: any,
  incomeHistory: any,
): number | null {
  if (!cashflowHistory && !balanceHistory && !incomeHistory) return null;
  let pts = 0;
  let evaluable = 0;

  // 1. Operating cash flow positive
  const cf = cashflowHistory?.cashflowStatements?.[0];
  const ocf = numOrNull(cf?.totalCashFromOperatingActivities);
  if (ocf != null) {
    evaluable++;
    if (ocf > 0) pts++;
  }
  // 2. ROE positive (from fundamentals)
  if (fund.returnOnEquity != null) {
    evaluable++;
    if (fund.returnOnEquity > 0) pts++;
  }
  // 3. Revenue growth positive
  if (fund.revenueGrowth != null) {
    evaluable++;
    if (fund.revenueGrowth > 0) pts++;
  }
  // 4. Gross margin improving Y/Y (current > prior year)
  const incs: any[] = incomeHistory?.incomeStatementHistory ?? [];
  if (incs.length >= 2) {
    const curRev = numOrNull(incs[0]?.totalRevenue);
    const curCogs = numOrNull(incs[0]?.costOfRevenue);
    const prevRev = numOrNull(incs[1]?.totalRevenue);
    const prevCogs = numOrNull(incs[1]?.costOfRevenue);
    if (curRev && curCogs != null && prevRev && prevCogs != null && curRev > 0 && prevRev > 0) {
      evaluable++;
      const curGM = (curRev - curCogs) / curRev;
      const prevGM = (prevRev - prevCogs) / prevRev;
      if (curGM > prevGM) pts++;
    }
  }
  // 5. Debt-to-equity decreasing (lower long-term debt ratio Y/Y)
  const bs: any[] = balanceHistory?.balanceSheetStatements ?? [];
  if (bs.length >= 2) {
    const curDebt = numOrNull(bs[0]?.longTermDebt);
    const curEq = numOrNull(bs[0]?.totalStockholderEquity);
    const prevDebt = numOrNull(bs[1]?.longTermDebt);
    const prevEq = numOrNull(bs[1]?.totalStockholderEquity);
    if (curDebt != null && curEq && curEq > 0 && prevDebt != null && prevEq && prevEq > 0) {
      evaluable++;
      if (curDebt / curEq < prevDebt / prevEq) pts++;
    }
  }

  if (evaluable < 3) return null; // not enough data to be meaningful
  // Scale: pts is 0..evaluable; normalize back to a 0..5 score.
  return Math.round((pts / evaluable) * 5);
}

interface FetchResult {
  data: ScreenerFundamentals;
  price: number | null;
  error?: string;
}

async function fetchFundamentals(ticker: string, mode: ScreenerMode): Promise<FetchResult> {
  const baseModules = ["price", "financialData", "defaultKeyStatistics", "majorHoldersBreakdown"];
  const gemModules = [
    "summaryDetail",
    "earningsTrend",
    "insiderTransactions",
    "netSharePurchaseActivity",
    "incomeStatementHistory",
    "cashflowStatementHistory",
    "balanceSheetHistory",
  ];
  const modules = mode === "gem" ? [...baseModules, ...gemModules] : baseModules;

  let qs: any = null;
  try {
    qs = await yahooFinance.quoteSummary(ticker, { modules: modules as any });
  } catch (e: any) {
    qs = e?.result ?? null;
    if (!qs) {
      return { data: emptyFundamentals(), price: null, error: e?.message ?? "quoteSummary failed" };
    }
  }

  const fd = qs?.financialData ?? {};
  const dks = qs?.defaultKeyStatistics ?? {};
  const sd = qs?.summaryDetail ?? {};
  const mhb = qs?.majorHoldersBreakdown ?? {};
  const p = qs?.price ?? {};

  const data: ScreenerFundamentals = {
    revenueGrowth: numOrNull(fd.revenueGrowth),
    earningsGrowth: numOrNull(fd.earningsGrowth),
    grossMargins: numOrNull(fd.grossMargins),
    operatingMargins: numOrNull(fd.operatingMargins),
    profitMargins: numOrNull(fd.profitMargins),
    freeCashflow: numOrNull(fd.freeCashflow),
    debtToEquity: numOrNull(fd.debtToEquity),
    returnOnEquity: numOrNull(fd.returnOnEquity),
    earningsQuarterlyGrowth: numOrNull(dks.earningsQuarterlyGrowth),
    recommendationMean: numOrNull(fd.recommendationMean),
    numberOfAnalystOpinions: numOrNull(fd.numberOfAnalystOpinions),
    targetMeanPrice: numOrNull(fd.targetMeanPrice),
    institutionsPercentHeld: numOrNull(mhb.institutionsPercentHeld),
    insidersPercentHeld: numOrNull(mhb.insidersPercentHeld),
    marketCap: numOrNull(p.marketCap) ?? numOrNull(dks.marketCap),
    trailingPE: numOrNull(dks.trailingPE),
    forwardPE: numOrNull(dks.forwardPE),
    pegRatio: numOrNull(dks.pegRatio),

    // Always-populated additions (no scoring impact in classic mode)
    shortPercentOfFloat: numOrNull(dks.shortPercentOfFloat),
    shortRatio: numOrNull(dks.shortRatio),
    beta: numOrNull(dks.beta) ?? numOrNull(sd.beta),
    sandp52WeekChange: numOrNull(dks.sandP52WeekChange) ?? numOrNull(dks["sandp52WeekChange"]),
    floatShares: numOrNull(dks.floatShares),
    sharesOutstanding: numOrNull(dks.sharesOutstanding),
    firstTradeDateMs: null,  // populated from chart history below

    epsRevisionDir: null,
    insiderClusterCount: null,
    netInsiderShares: null,
    piotroskiProxy: null,
  };

  // Gem-mode-only derived signals
  if (mode === "gem") {
    data.epsRevisionDir = classifyEpsRevisions(qs?.earningsTrend);
    const cluster = classifyInsiderCluster(qs?.insiderTransactions);
    data.insiderClusterCount = cluster.count;
    const nspa = qs?.netSharePurchaseActivity;
    data.netInsiderShares = numOrNull(nspa?.netInfoCount) ?? numOrNull(nspa?.netInfoShares) ?? null;
    data.piotroskiProxy = computePiotroskiProxy(
      data,
      qs?.cashflowStatementHistory,
      qs?.balanceSheetHistory,
      qs?.incomeStatementHistory,
    );
  }

  return {
    data,
    price: numOrNull(p.regularMarketPrice),
  };
}

async function screenTicker(
  entry: ThemeTicker,
  theme: Theme,
  ticker: string,
  regimeKind: import("@/types").RegimeKind,
  mode: ScreenerMode,
  spyCloses: number[] | null,
  discoverySource?: string,
): Promise<ScreenerRow | null> {
  // Pull ~3yr (36 months) of OHLCV in gem mode to enable RS-252 and base-length;
  // classic mode keeps the 14-month fetch for back-compat with existing cache.
  const months = mode === "gem" ? 36 : 14;

  const [fundResult, candles] = await Promise.all([
    fetchFundamentals(ticker, mode),
    getHistory(ticker, months).catch(() => []),
  ]);

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  // Derive firstTradeDateMs from chart history (most reliable fallback path).
  if (candles.length > 0) {
    const firstDate = new Date(candles[0].date + "T00:00:00Z").getTime();
    if (Number.isFinite(firstDate)) fundResult.data.firstTradeDateMs = firstDate;
  }

  // Decide trend vs early-IPO branch.
  const ipoAgeDays = fundResult.data.firstTradeDateMs != null
    ? (Date.now() - fundResult.data.firstTradeDateMs) / 86400000
    : Infinity;
  const useEarlyIpo = mode === "gem"
    && closes.length < 200
    && ipoAgeDays < EARLY_IPO_DAYS
    && closes.length >= 5;

  const trend = closes.length >= 200
    ? computeTrend({ closes, volumes, benchCloses: spyCloses ?? undefined })
    : null;
  const earlyTrend = useEarlyIpo
    ? computeEarlyTrend(closes, volumes, ipoAgeDays)
    : null;

  const gate1 = evaluateFundamentals(fundResult.data, entry.tag, mode);
  const gate2 = evaluateMoat(fundResult.data, entry, fundResult.price, mode);
  const gate3 = evaluateTrend(trend, entry.tag, mode, earlyTrend);
  const confidence = computeConfidence({
    gate1, gate2, gate3,
    fundamentals: fundResult.data,
    trend,
    regimeKind,
    mode,
  });

  const secondaryThemes: ThemeKey[] = [];
  for (const t of THEMES) {
    if (t.key === theme.key) continue;
    if (t.tickers.find((x) => x.ticker === ticker)) secondaryThemes.push(t.key);
  }

  const passedAll = gate1.passed && gate2.passed && gate3.passed;

  // Squeeze flag — Lamont-Stein 2003 squeeze setup. Only meaningful on passing names.
  const sf = fundResult.data.shortPercentOfFloat;
  const sr = fundResult.data.shortRatio;
  const squeezeFlag = mode === "gem"
    && passedAll
    && sf != null && sf > 0.20
    && sr != null && sr > 5;

  return {
    ticker,
    name: entry.name,
    primaryTheme: theme.key,
    primaryThemeLabel: theme.label,
    secondaryThemes,
    tag: entry.tag,
    chokepoint: entry.chokepoint,
    moatType: entry.moatType,
    fundamentals: fundResult.data,
    trend,
    earlyTrend,
    gate1, gate2, gate3,
    confidence,
    passedAll,
    error: fundResult.error,
    squeezeFlag: squeezeFlag || undefined,
    discoverySource,
  };
}

export interface RunScreenerOptions {
  mode?: ScreenerMode;
  discovery?: boolean;
}

export async function runScreener(opts: RunScreenerOptions = {}): Promise<ScreenerResult> {
  const mode: ScreenerMode = opts.mode ?? (process.env.SCREENER_MODE === "gem" ? "gem" : "classic");
  const discovery = opts.discovery ?? (mode === "gem" && isDiscoveryEnabled());

  const cacheKey = `${mode}:${discovery ? "d" : "n"}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const baseTickers = allScreenerTickers();
  const regime = await detectRegime();

  // Build the working theme/entry index. Discovery rows are appended as a
  // synthetic theme so the rest of the pipeline treats them uniformly.
  const themesPlus: Theme[] = [...THEMES];
  const tickerToEntry = new Map<string, { theme: Theme; entry: ThemeTicker; discoverySource?: string }>();
  for (const theme of THEMES) {
    for (const entry of theme.tickers) {
      if (!tickerToEntry.has(entry.ticker)) {
        tickerToEntry.set(entry.ticker, { theme, entry });
      }
    }
  }

  let universe = baseTickers;
  let discoveryUsed = false;
  if (discovery) {
    const existing = new Set(baseTickers);
    const found = await getDiscoveryTickers(existing);
    if (found.length > 0) {
      const synth = buildDiscoveryTheme(found);
      themesPlus.push(synth);
      for (const f of found) {
        tickerToEntry.set(f.ticker, { theme: synth, entry: f, discoverySource: f.discoverySource });
      }
      universe = [...baseTickers, ...found.map((f) => f.ticker)];
      discoveryUsed = true;
    }
  }

  // Fetch SPY closes once for gem-mode relative strength.
  const spyCloses: number[] | null = mode === "gem"
    ? await getHistory("SPY", 36).then((c) => c.map((x) => x.close)).catch(() => null)
    : null;

  const settled = await withConcurrency(universe, 8, (t) => {
    const meta = tickerToEntry.get(t) ?? findPrimaryTheme(t);
    if (!meta) return Promise.resolve(null);
    const { theme, entry } = meta as { theme: Theme; entry: ThemeTicker };
    const discoverySource = "discoverySource" in (meta as any) ? (meta as any).discoverySource : undefined;
    return screenTicker(entry, theme, t, regime.kind, mode, spyCloses, discoverySource).catch((e) => {
      console.warn(`[screener] ${t} failed:`, e?.message ?? e);
      return null;
    });
  });
  const rows = settled.filter((r): r is ScreenerRow => r != null);

  rows.sort((a, b) =>
    b.confidence.total - a.confidence.total || a.ticker.localeCompare(b.ticker),
  );

  const themes = themesPlus.map((t) => {
    const themeRows = rows.filter(
      (r) => r.primaryTheme === t.key || r.secondaryThemes.includes(t.key),
    );
    const counts = {
      core: themeRows.filter((r) => r.tag === "core").length,
      emerging: themeRows.filter((r) => r.tag === "emerging").length,
      venture: themeRows.filter((r) => r.tag === "venture").length,
      total: themeRows.length,
      passed: themeRows.filter((r) => r.passedAll).length,
    };
    return {
      key: t.key,
      label: t.label,
      rationale: t.rationale,
      sleeveCapPct: t.sleeveCapPct,
      counts,
    };
  });

  const result: ScreenerResult = {
    asOf: new Date().toISOString(),
    mode,
    regime,
    rows,
    themes,
    discoveryUsed,
  };
  _cache.set(cacheKey, { at: Date.now(), value: result });
  return result;
}
