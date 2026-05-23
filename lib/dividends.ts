import YahooFinance from "yahoo-finance2";
import { getQuotes } from "@/lib/yahoo";
import { readExecutions, aggregateHoldings } from "@/lib/store";
import { TARGETS } from "@/config/portfolio";
import type { PortfolioKind } from "@/config/bundle";
import type { TargetWeight } from "@/types";

const yahooFinance = new YahooFinance();
// @ts-ignore
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

export interface DividendInfo {
  ticker: string;
  trailingAnnualDividendRate: number;
  trailingAnnualDividendYield: number;
  exDividendDate?: string;
  lastDividendValue?: number;
}

const cache = new Map<string, { at: number; value: DividendInfo }>();
const CACHE_MS = 60 * 60 * 1000;

export async function getDividend(ticker: string): Promise<DividendInfo> {
  const c = cache.get(ticker);
  if (c && Date.now() - c.at < CACHE_MS) return c.value;
  try {
    const res: any = await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail", "defaultKeyStatistics", "price"] as any,
    });
    const sd = res.summaryDetail ?? {};
    const dks = res.defaultKeyStatistics ?? {};
    const price = res.price ?? {};
    const currentPrice = Number(price.regularMarketPrice ?? sd.navPrice ?? 0);

    const yieldPct = Number(sd.yield ?? sd.trailingAnnualDividendYield ?? sd.dividendYield ?? 0) || 0;

    let annualRate = Number(sd.trailingAnnualDividendRate ?? sd.dividendRate ?? 0) || 0;
    if (annualRate === 0 && yieldPct > 0 && currentPrice > 0) {
      annualRate = Number((yieldPct * currentPrice).toFixed(4));
    }

    const info: DividendInfo = {
      ticker,
      trailingAnnualDividendRate: annualRate,
      trailingAnnualDividendYield: yieldPct,
      exDividendDate: sd.exDividendDate ? new Date(sd.exDividendDate).toISOString().slice(0, 10) : undefined,
      lastDividendValue: Number(dks.lastDividendValue ?? 0) || undefined,
    };
    cache.set(ticker, { at: Date.now(), value: info });
    return info;
  } catch {
    const empty: DividendInfo = { ticker, trailingAnnualDividendRate: 0, trailingAnnualDividendYield: 0 };
    cache.set(ticker, { at: Date.now(), value: empty });
    return empty;
  }
}

export interface IncomeRow {
  ticker: string;
  name: string;
  role: string;
  shares: number;
  yieldPct: number;
  annualRate: number;
  projectedAnnualIncome: number;
  exDividendDate?: string;
  lastDividendValue?: number;
}

export interface IncomeReport {
  rows: IncomeRow[];
  totalProjectedAnnual: number;
  blendedYield: number;
  upcoming: IncomeRow[];
}

export interface IncomeOptions {
  kind?: PortfolioKind;
  targets?: ReadonlyArray<TargetWeight>;
}

export async function computeIncome(opts: IncomeOptions = {}): Promise<IncomeReport> {
  const kind = opts.kind ?? "etf";
  const targets = opts.targets ?? TARGETS;
  const tickers = targets.map((t) => t.ticker as string);
  const [execs, divs, quotes] = await Promise.all([
    readExecutions(kind),
    Promise.all(tickers.map(getDividend)),
    getQuotes(tickers),
  ]);
  const divByTicker = new Map(divs.map((d) => [d.ticker, d]));
  const priceByTicker = new Map(quotes.map((q) => [q.ticker, q.price]));
  const holdings = aggregateHoldings(execs);
  const sharesByTicker = new Map(holdings.map((h) => [h.ticker, h.shares]));

  const rows: IncomeRow[] = targets.map((t) => {
    const d = divByTicker.get(t.ticker) ?? { trailingAnnualDividendRate: 0, trailingAnnualDividendYield: 0 } as any;
    const shares = sharesByTicker.get(t.ticker) ?? 0;
    const projected = shares * (d.trailingAnnualDividendRate ?? 0);
    return {
      ticker: t.ticker,
      name: t.name,
      role: t.role,
      shares,
      yieldPct: d.trailingAnnualDividendYield ?? 0,
      annualRate: d.trailingAnnualDividendRate ?? 0,
      projectedAnnualIncome: projected,
      exDividendDate: d.exDividendDate,
      lastDividendValue: d.lastDividendValue,
    };
  });

  const totalProjectedAnnual = rows.reduce((s, r) => s + r.projectedAnnualIncome, 0);
  let weightedYield = 0, totalVal = 0;
  for (const r of rows) {
    const price = priceByTicker.get(r.ticker) ?? 0;
    const v = r.shares * price;
    totalVal += v;
    weightedYield += v * r.yieldPct;
  }
  const blendedYield = totalVal > 0 ? weightedYield / totalVal : 0;

  const upcoming = [...rows]
    .filter((r) => r.exDividendDate)
    .sort((a, b) => (a.exDividendDate ?? "").localeCompare(b.exDividendDate ?? ""));

  return { rows, totalProjectedAnnual, blendedYield, upcoming };
}
