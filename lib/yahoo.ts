import YahooFinance from "yahoo-finance2";
import type { Candle, Quote } from "@/types";

const yahooFinance = new YahooFinance();
// @ts-ignore - runtime helper
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

type CacheEntry<T> = { at: number; value: T; ttl?: number };
const CACHE_MS = 60 * 1000;
const cache = new Map<string, CacheEntry<unknown>>();

// Data-quality thresholds. A quote older than MAX_STALENESS_MS is marked
// "stale"; thinly-traded names (avg volume below THIN_VOLUME) are "illiquid".
// During RTH (9:30–16:00 ET) staleness threshold is tighter than off-hours.
const MAX_STALENESS_RTH_MS  = 15 * 60 * 1000;  // 15 min during RTH
const MAX_STALENESS_OFF_MS  = 24 * 60 * 60 * 1000; // 24h overnight/weekends
const THIN_VOLUME           = 250_000;          // avg daily shares; below = illiquid
// Spread wider than this for thin names triggers "illiquid" verdict.
const WIDE_SPREAD_PCT       = 0.02;

function isRegularSession(d: Date = new Date()): boolean {
  // US equities regular session in ET (handles DST transitions).
  // Mon-Fri, 09:30–16:00 ET.
  const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dow = et.getDay();
  if (dow === 0 || dow === 6) return false;
  const m = et.getHours() * 60 + et.getMinutes();
  return m >= 9 * 60 + 30 && m < 16 * 60;
}

function getCache<T>(key: string): T | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  const ttl = e.ttl ?? CACHE_MS;
  if (Date.now() - e.at > ttl) {
    cache.delete(key);
    return undefined;
  }
  return e.value as T;
}
function setCache<T>(key: string, value: T, ttlMs?: number) {
  cache.set(key, { at: Date.now(), value, ttl: ttlMs });
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const key = `q:${[...symbols].sort().join(",")}`;
  const cached = getCache<Quote[]>(key);
  if (cached) return cached;
  const res = await yahooFinance.quote(symbols);
  const arr = Array.isArray(res) ? res : [res];
  const now = Date.now();
  const stalenessLimit = isRegularSession() ? MAX_STALENESS_RTH_MS : MAX_STALENESS_OFF_MS;
  const out: Quote[] = arr.map((q: any) => {
    const ts = q.regularMarketTime;
    const ms = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : (ts instanceof Date ? ts.getTime() : Date.now());
    const rawPrice = q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? null;
    const bid = typeof q.bid === "number" && q.bid > 0 ? q.bid : undefined;
    const ask = typeof q.ask === "number" && q.ask > 0 ? q.ask : undefined;
    const avgVolume = typeof q.averageDailyVolume3Month === "number" ? q.averageDailyVolume3Month
                    : typeof q.averageDailyVolume10Day === "number" ? q.averageDailyVolume10Day
                    : undefined;
    const spreadPct = bid != null && ask != null && ask > 0 ? (ask - bid) / ((ask + bid) / 2) : 0;

    let dataQuality: Quote["dataQuality"] = "ok";
    let qualityReason: string | undefined;
    if (rawPrice == null || rawPrice <= 0) {
      dataQuality = "invalid";
      qualityReason = "no live price returned by Yahoo";
      // eslint-disable-next-line no-console
      console.warn(`[yahoo] ${q.symbol}: invalid price — quote rejected`);
    } else if (now - ms > stalenessLimit) {
      const mins = Math.round((now - ms) / 60_000);
      dataQuality = "stale";
      qualityReason = `quote is ${mins}m old (limit ${Math.round(stalenessLimit / 60_000)}m)`;
    } else if (avgVolume != null && avgVolume < THIN_VOLUME) {
      dataQuality = "illiquid";
      qualityReason = `avg volume ${(avgVolume / 1000).toFixed(0)}k < ${(THIN_VOLUME / 1000).toFixed(0)}k threshold`;
    } else if (spreadPct > WIDE_SPREAD_PCT) {
      dataQuality = "illiquid";
      qualityReason = `bid-ask spread ${(spreadPct * 100).toFixed(1)}% > ${(WIDE_SPREAD_PCT * 100).toFixed(0)}%`;
    }
    return {
      ticker: q.symbol,
      price: rawPrice ?? 0,
      changePct: q.regularMarketChangePercent ?? 0,
      asOf: new Date(ms).toISOString(),
      bid,
      ask,
      avgVolume,
      dataQuality,
      qualityReason,
      spreadPct,
    };
  });
  setCache(key, out);
  return out;
}

/**
 * Real bid/ask midpoint for execution sizing. Falls back to last trade when
 * NBBO unavailable. Caller should consult `quote.spreadPct` to decide whether
 * the mid is trustworthy.
 */
export function midPrice(q: Quote): number {
  if (q.bid != null && q.ask != null && q.bid > 0 && q.ask > 0) {
    return (q.bid + q.ask) / 2;
  }
  return q.price;
}

export async function getHistory(symbol: string, months = 9): Promise<Candle[]> {
  const key = `h:${symbol}:${months}`;
  const cached = getCache<Candle[]>(key);
  if (cached) return cached;
  const period2 = new Date();
  const period1 = new Date();
  period1.setMonth(period1.getMonth() - months);
  const res: any = await yahooFinance.chart(symbol, {
    period1,
    period2,
    interval: "1d",
  });
  const candles: Candle[] = (res.quotes ?? [])
    .filter((q: any) => q.close != null)
    .map((q: any) => ({
      date: (q.date instanceof Date ? q.date : new Date(q.date)).toISOString().slice(0, 10),
      close: q.close,
      high: q.high ?? q.close,
      low: q.low ?? q.close,
      open: q.open ?? q.close,
      volume: q.volume ?? 0,
    }));
  setCache(key, candles);
  return candles;
}

export async function getCloseSeries(symbol: string, months = 9): Promise<number[]> {
  const c = await getHistory(symbol, months);
  return c.map((x) => x.close);
}

// Intraday OHLCV candles. Defaults match the Yahoo "1d/1m" chart view. Cached
// briefly (45s) so repeated dashboard renders don't hammer Yahoo — fresh
// enough for a 1-min candle chart with auto-refresh on top.
export interface IntradayCandle {
  ts: number;        // epoch milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export type IntradayInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "60m";
export type IntradayRange    = "1d" | "5d" | "6d";

export async function getIntradayCandles(
  symbol: string,
  interval: IntradayInterval = "1m",
  range: IntradayRange = "1d",
): Promise<IntradayCandle[]> {
  const key = `i:${symbol}:${interval}:${range}`;
  const cached = getCache<IntradayCandle[]>(key);
  if (cached) return cached;
  // Yahoo intraday API: range maps to a period window. 1d range gives the
  // current session (or last session if market closed). For "5d" we deliberately
  // ask Yahoo for ~8 calendar days back so weekends/holidays don't shrink the
  // window below the 5 prior trading sessions + today the user expects.
  const period2 = new Date();
  const period1 = new Date(period2);
  if (range === "6d")      period1.setDate(period2.getDate() - 10);
  else if (range === "5d") period1.setDate(period2.getDate() - 8);
  else                     period1.setDate(period2.getDate() - 1);
  let res: any;
  try {
    res = await yahooFinance.chart(symbol, { period1, period2, interval });
  } catch (e) {
    console.warn(`[yahoo] intraday fetch failed for ${symbol}@${interval}:`, e);
    return [];
  }
  const candles: IntradayCandle[] = (res.quotes ?? [])
    .filter((q: any) => q.close != null && q.open != null)
    .map((q: any) => ({
      ts: (q.date instanceof Date ? q.date : new Date(q.date)).getTime(),
      open: q.open,
      high: q.high ?? q.close,
      low: q.low ?? q.close,
      close: q.close,
      volume: q.volume ?? 0,
    }));
  setCache(key, candles, 45_000);
  return candles;
}
