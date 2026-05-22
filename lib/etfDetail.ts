import YahooFinance from "yahoo-finance2";
import { getHistory } from "@/lib/yahoo";
import { macd as macdLast, rsi as rsiLast, sma } from "@/lib/indicators";

const yahooFinance = new YahooFinance();
// @ts-ignore
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

export interface EtfDetail {
  ticker: string;
  name: string;
  family: string;
  category: string;
  inception?: string;
  totalAssets?: number;
  expenseRatio?: number;
  price: number;
  change: number;
  changePct: number;
  nav?: number;
  yield?: number;
  trailingDividendRate?: number;
  exDividendDate?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  beta?: number;
  morningstarRating?: number;
  trailingReturns: { period: string; value: number | null }[];
  annualReturns: { year: number; value: number }[];
  topHoldings: { symbol: string; name: string; weight: number }[];
  sectorWeightings: { sector: string; weight: number }[];
  riskStats3y?: { stdDev?: number; beta?: number; alpha?: number; sharpe?: number; rSquared?: number };
  news: { title: string; link: string; publisher?: string; providerPublishTime?: number }[];
  technicals: { rsi14: number; macdHist: number; macdLine: number; macdSignal: number; sma50: number; sma200: number };
}

const RANGE_KEYS = ["oneMonth", "threeMonth", "ytd", "oneYear", "threeYear", "fiveYear", "tenYear"];
const RANGE_LABELS: Record<string, string> = {
  oneMonth: "1M", threeMonth: "3M", ytd: "YTD", oneYear: "1Y", threeYear: "3Y", fiveYear: "5Y", tenYear: "10Y",
};

export async function getEtfDetail(ticker: string): Promise<EtfDetail | null> {
  let qs: any;
  try {
    qs = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "price", "summaryDetail", "defaultKeyStatistics",
        "fundProfile", "fundPerformance", "topHoldings",
      ] as any,
    });
  } catch {
    return null;
  }

  const price = qs.price ?? {};
  const sd = qs.summaryDetail ?? {};
  const dks = qs.defaultKeyStatistics ?? {};
  const fp = qs.fundProfile ?? {};
  const fperf = qs.fundPerformance ?? {};
  const th = qs.topHoldings ?? {};

  const trailing = fperf.trailingReturns ?? {};
  const trailingReturns = RANGE_KEYS.map((k) => ({
    period: RANGE_LABELS[k],
    value: trailing[k] != null ? Number(trailing[k]) : null,
  }));

  const annualReturns: { year: number; value: number }[] = (fperf.annualTotalReturns?.returns ?? [])
    .map((r: any) => ({ year: Number(r.year), value: Number(r.annualValue) }))
    .filter((r: any) => Number.isFinite(r.year) && Number.isFinite(r.value));

  const holdings = (th.holdings ?? []).map((h: any) => ({
    symbol: h.symbol ?? "",
    name: h.holdingName ?? h.symbol ?? "",
    weight: Number(h.holdingPercent ?? 0),
  }));

  const sectors: { sector: string; weight: number }[] = (th.sectorWeightings ?? []).flatMap((s: any) =>
    Object.entries(s).map(([k, v]) => ({ sector: prettySector(k), weight: Number(v) }))
  );

  // Risk stats — find 3yr row if present.
  let riskStats3y: EtfDetail["riskStats3y"] | undefined;
  const rows: any[] = fperf.riskOverviewStatistics?.riskStatistics ?? [];
  const r3 = rows.find((r) => /3/.test(String(r.year ?? r.period ?? "")));
  if (r3) {
    riskStats3y = {
      stdDev: r3.stdDev != null ? Number(r3.stdDev) : undefined,
      beta:   r3.beta   != null ? Number(r3.beta) : undefined,
      alpha:  r3.alpha  != null ? Number(r3.alpha) : undefined,
      sharpe: r3.sharpeRatio != null ? Number(r3.sharpeRatio) : undefined,
      rSquared: r3.rSquared != null ? Number(r3.rSquared) : undefined,
    };
  }

  // Technicals — compute from 9 months of candles.
  let technicals = { rsi14: NaN, macdHist: NaN, macdLine: NaN, macdSignal: NaN, sma50: NaN, sma200: NaN };
  try {
    const candles = await getHistory(ticker, 12);
    const closes = candles.map((c) => c.close);
    const m = macdLast(closes);
    technicals = {
      rsi14: rsiLast(closes, 14),
      macdHist: m.hist,
      macdLine: m.macd,
      macdSignal: m.signal,
      sma50: sma(closes, 50),
      sma200: sma(closes, 200),
    };
  } catch {}

  // News.
  let news: EtfDetail["news"] = [];
  try {
    const s = await yahooFinance.search(ticker, { newsCount: 5, quotesCount: 0 } as any);
    news = (s as any).news?.slice(0, 5).map((n: any) => ({
      title: n.title,
      link: n.link,
      publisher: n.publisher,
      providerPublishTime: typeof n.providerPublishTime === "number"
        ? n.providerPublishTime
        : (n.providerPublishTime instanceof Date ? n.providerPublishTime.getTime() / 1000 : undefined),
    })) ?? [];
  } catch {}

  return {
    ticker: price.symbol ?? ticker,
    name: price.longName ?? price.shortName ?? ticker,
    family: fp.family ?? "—",
    category: fp.categoryName ?? "—",
    inception: dks.fundInceptionDate ? new Date(dks.fundInceptionDate).toISOString().slice(0, 10) : undefined,
    totalAssets: Number(sd.totalAssets ?? dks.totalAssets ?? 0) || undefined,
    expenseRatio: Number(fp.feesExpensesInvestment?.annualReportExpenseRatio ?? 0) || undefined,
    price: Number(price.regularMarketPrice ?? 0),
    change: Number(price.regularMarketChange ?? 0),
    changePct: Number(price.regularMarketChangePercent ?? 0),
    nav: Number(sd.navPrice ?? 0) || undefined,
    yield: Number(sd.yield ?? sd.trailingAnnualDividendYield ?? 0) || undefined,
    trailingDividendRate: Number(sd.trailingAnnualDividendRate ?? 0) || undefined,
    exDividendDate: sd.exDividendDate ? new Date(sd.exDividendDate).toISOString().slice(0, 10) : undefined,
    fiftyTwoWeekHigh: Number(sd.fiftyTwoWeekHigh ?? 0) || undefined,
    fiftyTwoWeekLow: Number(sd.fiftyTwoWeekLow ?? 0) || undefined,
    fiftyDayAverage: Number(sd.fiftyDayAverage ?? 0) || undefined,
    twoHundredDayAverage: Number(sd.twoHundredDayAverage ?? 0) || undefined,
    beta: Number(dks.beta ?? 0) || undefined,
    morningstarRating: Number(dks.morningStarOverallRating?.raw ?? dks.morningStarOverallRating ?? 0) || undefined,
    trailingReturns,
    annualReturns,
    topHoldings: holdings,
    sectorWeightings: sectors,
    riskStats3y,
    news,
    technicals,
  };
}

function prettySector(key: string): string {
  const map: Record<string, string> = {
    realestate: "Real Estate", consumer_cyclical: "Consumer Cyclical", basic_materials: "Basic Materials",
    consumer_defensive: "Consumer Defensive", technology: "Technology", communication_services: "Communication Services",
    financial_services: "Financial Services", utilities: "Utilities", industrials: "Industrials",
    energy: "Energy", healthcare: "Healthcare",
  };
  return map[key] ?? key.replace(/_/g, " ");
}
