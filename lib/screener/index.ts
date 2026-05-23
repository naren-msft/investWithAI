import YahooFinance from "yahoo-finance2";
import { getCloseSeries } from "@/lib/yahoo";
import { detectRegime } from "@/lib/regime";
import {
  THEMES,
  allScreenerTickers,
  findPrimaryTheme,
  type ThemeKey,
} from "@/config/screener-themes";
import type { ScreenerFundamentals, ScreenerResult, ScreenerRow } from "./types";
import { evaluateFundamentals } from "./fundamentals";
import { evaluateMoat } from "./moat";
import { computeTrend, evaluateTrend } from "./trend";
import { computeConfidence } from "./score";

const yahooFinance = new YahooFinance();
// @ts-ignore
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

const CACHE_MS = 5 * 60 * 1000;
let _cache: { at: number; value: ScreenerResult } | null = null;

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
  };
}

async function fetchFundamentals(ticker: string): Promise<{ data: ScreenerFundamentals; price: number | null; error?: string }> {
  let qs: any = null;
  try {
    qs = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "price",
        "financialData",
        "defaultKeyStatistics",
        "majorHoldersBreakdown",
      ] as any,
    });
  } catch (e: any) {
    qs = e?.result ?? null;
    if (!qs) {
      return { data: emptyFundamentals(), price: null, error: e?.message ?? "quoteSummary failed" };
    }
  }

  const fd = qs?.financialData ?? {};
  const dks = qs?.defaultKeyStatistics ?? {};
  const mhb = qs?.majorHoldersBreakdown ?? {};
  const p = qs?.price ?? {};

  return {
    data: {
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
    },
    price: numOrNull(p.regularMarketPrice),
  };
}

async function screenTicker(
  ticker: string,
  regimeKind: import("@/types").RegimeKind,
): Promise<ScreenerRow | null> {
  const primary = findPrimaryTheme(ticker);
  if (!primary) return null;
  const { theme, entry } = primary;

  const [fundResult, closes] = await Promise.all([
    fetchFundamentals(ticker),
    getCloseSeries(ticker, 14).catch(() => [] as number[]),
  ]);

  const trend = closes.length >= 200 ? computeTrend(closes) : null;
  const gate1 = evaluateFundamentals(fundResult.data, entry.tag);
  const gate2 = evaluateMoat(fundResult.data, entry, fundResult.price);
  const gate3 = evaluateTrend(trend, entry.tag);
  const confidence = computeConfidence({
    gate1, gate2, gate3,
    fundamentals: fundResult.data,
    trend,
    regimeKind,
  });

  const secondaryThemes: ThemeKey[] = [];
  for (const t of THEMES) {
    if (t.key === theme.key) continue;
    if (t.tickers.find((x) => x.ticker === ticker)) secondaryThemes.push(t.key);
  }

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
    gate1, gate2, gate3,
    confidence,
    passedAll: gate1.passed && gate2.passed && gate3.passed,
    error: fundResult.error,
  };
}

export async function runScreener(): Promise<ScreenerResult> {
  if (_cache && Date.now() - _cache.at < CACHE_MS) return _cache.value;

  const tickers = allScreenerTickers();
  const regime = await detectRegime();

  const settled = await withConcurrency(tickers, 8, (t) =>
    screenTicker(t, regime.kind).catch((e) => {
      console.warn(`[screener] ${t} failed:`, e?.message ?? e);
      return null;
    }),
  );
  const rows = settled.filter((r): r is ScreenerRow => r != null);

  rows.sort((a, b) =>
    b.confidence.total - a.confidence.total || a.ticker.localeCompare(b.ticker),
  );

  const themes = THEMES.map((t) => {
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
    regime,
    rows,
    themes,
  };
  _cache = { at: Date.now(), value: result };
  return result;
}
