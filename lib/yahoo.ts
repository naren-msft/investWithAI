import YahooFinance from "yahoo-finance2";
import type { Candle, Quote } from "@/types";

const yahooFinance = new YahooFinance();
// @ts-ignore - runtime helper
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

type CacheEntry<T> = { at: number; value: T };
const CACHE_MS = 60 * 1000;
const cache = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string): T | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > CACHE_MS) {
    cache.delete(key);
    return undefined;
  }
  return e.value as T;
}
function setCache<T>(key: string, value: T) {
  cache.set(key, { at: Date.now(), value });
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const key = `q:${[...symbols].sort().join(",")}`;
  const cached = getCache<Quote[]>(key);
  if (cached) return cached;
  const res = await yahooFinance.quote(symbols);
  const arr = Array.isArray(res) ? res : [res];
  const out: Quote[] = arr.map((q: any) => {
    const ts = q.regularMarketTime;
    const ms = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : (ts instanceof Date ? ts.getTime() : Date.now());
    return {
      ticker: q.symbol,
      price: q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? 0,
      changePct: q.regularMarketChangePercent ?? 0,
      asOf: new Date(ms).toISOString(),
    };
  });
  setCache(key, out);
  return out;
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
