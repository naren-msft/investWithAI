import YahooFinance from "yahoo-finance2";
import { getHistory } from "@/lib/yahoo";
import { macd as macdLast, rsi as rsiLast, sma } from "@/lib/indicators";

const yahooFinance = new YahooFinance();
// @ts-ignore
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

export interface StockDetail {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  country?: string;
  website?: string;
  longBusinessSummary?: string;
  fullTimeEmployees?: number;

  price: number;
  change: number;
  changePct: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToBook?: number;
  beta?: number;

  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  averageDailyVolume3Month?: number;

  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
  payoutRatio?: number;

  earningsDate?: string;
  trailingEps?: number;
  forwardEps?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;

  news: { title: string; link: string; publisher?: string; providerPublishTime?: number }[];
  technicals: { rsi14: number; macdHist: number; macdLine: number; macdSignal: number; sma50: number; sma200: number };
}

// Fetches company profile + valuation + dividend + technicals for an individual
// stock. Mirrors lib/etfDetail.ts but uses stock-specific Yahoo modules
// (assetProfile, financialData, summaryProfile) and skips the ETF-only ones
// (fundProfile, fundPerformance, topHoldings).
export async function getStockDetail(ticker: string): Promise<StockDetail | null> {
  let qs: any;
  try {
    qs = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "price", "summaryDetail", "defaultKeyStatistics",
        "assetProfile", "summaryProfile", "financialData",
        "calendarEvents", "earnings",
      ] as any,
    });
  } catch {
    return null;
  }

  const p = qs.price ?? {};
  const sd = qs.summaryDetail ?? {};
  const dks = qs.defaultKeyStatistics ?? {};
  const ap = qs.assetProfile ?? qs.summaryProfile ?? {};
  const fd = qs.financialData ?? {};
  const ce = qs.calendarEvents ?? {};

  const change = p.regularMarketChange ?? 0;
  const changePct = (p.regularMarketChangePercent ?? 0) * 100;

  // Technicals — same engine that drives signalAnalysisAgent so the detail
  // page numbers line up exactly with the buy-signal panel.
  let tech = { rsi14: NaN, macdHist: NaN, macdLine: NaN, macdSignal: NaN, sma50: NaN, sma200: NaN };
  try {
    const candles = await getHistory(ticker, 12);
    const closes = candles.map((c) => c.close).filter((v: number) => Number.isFinite(v));
    if (closes.length >= 35) {
      tech.rsi14 = rsiLast(closes, 14);
      const m = macdLast(closes);
      tech.macdHist = m.hist;
      tech.macdLine = m.macd;
      tech.macdSignal = m.signal;
      tech.sma50 = sma(closes, 50);
      tech.sma200 = sma(closes, 200);
    }
  } catch { /* tolerate */ }

  let news: StockDetail["news"] = [];
  try {
    const ns = await yahooFinance.search(ticker, { newsCount: 6 } as any);
    news = (ns.news ?? []).slice(0, 6).map((n: any) => ({
      title: n.title,
      link: n.link,
      publisher: n.publisher,
      providerPublishTime: n.providerPublishTime,
    }));
  } catch { /* tolerate */ }

  const earningsDate = (() => {
    const ed = ce.earnings?.earningsDate;
    if (Array.isArray(ed) && ed[0]) {
      const d = ed[0] instanceof Date ? ed[0] : new Date(ed[0]);
      return d.toISOString().slice(0, 10);
    }
    return undefined;
  })();

  return {
    ticker,
    name: p.longName ?? p.shortName ?? ticker,
    sector: ap.sector,
    industry: ap.industry,
    country: ap.country,
    website: ap.website,
    longBusinessSummary: ap.longBusinessSummary,
    fullTimeEmployees: ap.fullTimeEmployees,

    price: p.regularMarketPrice ?? 0,
    change,
    changePct,
    marketCap: p.marketCap ?? sd.marketCap,
    trailingPE: sd.trailingPE,
    forwardPE: sd.forwardPE ?? dks.forwardPE,
    pegRatio: dks.pegRatio,
    priceToBook: dks.priceToBook,
    beta: sd.beta ?? dks.beta,

    fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: sd.fiftyTwoWeekLow,
    fiftyDayAverage: sd.fiftyDayAverage,
    twoHundredDayAverage: sd.twoHundredDayAverage,
    averageDailyVolume3Month: sd.averageDailyVolume3Month,

    dividendRate: sd.dividendRate,
    dividendYield: sd.dividendYield,
    exDividendDate: sd.exDividendDate ? new Date(sd.exDividendDate).toISOString().slice(0, 10) : undefined,
    payoutRatio: sd.payoutRatio,

    earningsDate,
    trailingEps: dks.trailingEps,
    forwardEps: dks.forwardEps,
    revenueGrowth: fd.revenueGrowth,
    earningsGrowth: fd.earningsGrowth,

    news,
    technicals: tech,
  };
}
