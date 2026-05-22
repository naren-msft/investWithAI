import { getCloseSeries, getHistory } from "@/lib/yahoo";
import type { Execution } from "@/lib/store";

export interface EquityPoint {
  date: string;
  costBasis: number;
  marketValue: number;
  gain: number;
  gainPct: number;
  spyBenchmark: number;     // what cost basis would be worth if invested in SPY on the same dates
  spyGainPct: number;
}

export interface RiskMetrics {
  annualVol: number;         // annualized standard deviation of daily portfolio returns
  maxDrawdown: number;       // peak-to-trough (negative number)
  maxDrawdownStart: string;
  maxDrawdownEnd: string;
  sharpe: number;            // (annualized return - rf) / annualVol
  sortino: number;           // downside-only equivalent
  beta: number;              // vs SPY daily returns
  calmar: number;            // CAGR / |maxDrawdown|
  portfolioReturn: number;   // CAGR over the period
  spyReturn: number;         // CAGR for the SPY benchmark over same period
  alphaVsSpy: number;        // portfolioReturn - spyReturn
  daysTracked: number;
}

const RISK_FREE_RATE = 0.0525; // ~3M T-bill mid-2026

export async function computeEquityCurve(
  execs: Execution[]
): Promise<{ points: EquityPoint[]; metrics: RiskMetrics | null }> {
  if (execs.length === 0) return { points: [], metrics: null };

  const sorted = [...execs].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = sorted[0].date;
  const startMs = new Date(startDate).getTime();
  const months = Math.max(1, Math.min(60, Math.ceil((Date.now() - startMs) / (30 * 24 * 60 * 60 * 1000)) + 1));

  const tickers = Array.from(new Set(sorted.map((e) => e.ticker)));
  const [histories, spyCandles] = await Promise.all([
    Promise.all(tickers.map(async (t) => ({ ticker: t, candles: await getHistory(t, months) }))),
    getHistory("SPY", months),
  ]);

  // Canonical trading-day axis from union of all histories + SPY.
  const dateSet = new Set<string>();
  for (const h of histories) for (const c of h.candles) if (c.date >= startDate) dateSet.add(c.date);
  for (const c of spyCandles) if (c.date >= startDate) dateSet.add(c.date);
  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) return { points: [], metrics: null };

  // Forward-fill closes per ticker + SPY.
  function fillSeries(candles: { date: string; close: number }[]): Map<string, number> {
    const ci = new Map(candles.map((c) => [c.date, c.close]));
    const out = new Map<string, number>();
    let last = 0;
    for (const d of dates) {
      const px = ci.get(d);
      if (px != null) last = px;
      out.set(d, last);
    }
    return out;
  }
  const closeByTicker = new Map<string, Map<string, number>>();
  for (const h of histories) closeByTicker.set(h.ticker, fillSeries(h.candles));
  const spyByDate = fillSeries(spyCandles);

  // Walk dates, apply executions, accumulate cost basis + market value.
  // For SPY benchmark: simulate buying $cost of SPY at SPY's price on each execution date.
  const sharesByTicker = new Map<string, number>(tickers.map((t) => [t, 0]));
  let runningCost = 0;
  let spySharesAccum = 0; // total SPY shares "bought" if we'd put every $ into SPY on the execution date
  let execIdx = 0;
  const points: EquityPoint[] = [];

  for (const d of dates) {
    while (execIdx < sorted.length && sorted[execIdx].date <= d) {
      const e = sorted[execIdx];
      sharesByTicker.set(e.ticker, (sharesByTicker.get(e.ticker) ?? 0) + e.shares);
      runningCost += e.shares * e.price;
      const spyPxOnExec = spyByDate.get(e.date) ?? spyByDate.get(d) ?? 0;
      if (spyPxOnExec > 0) spySharesAccum += (e.shares * e.price) / spyPxOnExec;
      execIdx++;
    }
    let mv = 0;
    for (const [tk, sh] of sharesByTicker) {
      if (sh <= 0) continue;
      mv += sh * (closeByTicker.get(tk)?.get(d) ?? 0);
    }
    const spyPx = spyByDate.get(d) ?? 0;
    const spyMv = spySharesAccum * spyPx;
    const gain = mv - runningCost;
    points.push({
      date: d,
      costBasis: round2(runningCost),
      marketValue: round2(mv),
      gain: round2(gain),
      gainPct: runningCost > 0 ? round4(gain / runningCost) : 0,
      spyBenchmark: round2(spyMv),
      spyGainPct: runningCost > 0 ? round4((spyMv - runningCost) / runningCost) : 0,
    });
  }

  const metrics = computeRiskMetrics(points, dates, spyByDate);
  return { points, metrics };
}

function round2(n: number) { return Number(n.toFixed(2)); }
function round4(n: number) { return Number(n.toFixed(4)); }

function computeRiskMetrics(points: EquityPoint[], dates: string[], spyByDate: Map<string, number>): RiskMetrics | null {
  if (points.length < 2) return null;

  // Daily portfolio returns from marketValue (skip days where MV is 0).
  const portRet: number[] = [];
  const spyRet: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].marketValue, b = points[i].marketValue;
    const sa = spyByDate.get(dates[i - 1]) ?? 0, sb = spyByDate.get(dates[i]) ?? 0;
    if (a > 0 && b > 0) portRet.push(b / a - 1);
    if (sa > 0 && sb > 0) spyRet.push(sb / sa - 1);
  }
  if (portRet.length < 2) return null;

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const stdev = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  };
  const downside = portRet.filter((r) => r < 0);
  const downStdev = downside.length > 1 ? Math.sqrt(downside.reduce((s, x) => s + x * x, 0) / downside.length) : 0;

  // Max drawdown over marketValue series.
  let peak = points[0].marketValue, peakDate = points[0].date;
  let maxDD = 0, ddStart = "", ddEnd = "";
  for (const p of points) {
    if (p.marketValue > peak) { peak = p.marketValue; peakDate = p.date; }
    if (peak > 0) {
      const dd = (p.marketValue - peak) / peak;
      if (dd < maxDD) { maxDD = dd; ddStart = peakDate; ddEnd = p.date; }
    }
  }

  // Annualized stats (assume 252 trading days).
  const dailyMean = mean(portRet);
  const annReturn = (1 + dailyMean) ** 252 - 1;
  const annVol = stdev(portRet) * Math.sqrt(252);
  const annDownVol = downStdev * Math.sqrt(252);
  const sharpe = annVol > 0 ? (annReturn - RISK_FREE_RATE) / annVol : 0;
  const sortino = annDownVol > 0 ? (annReturn - RISK_FREE_RATE) / annDownVol : 0;
  const calmar = maxDD < 0 ? annReturn / Math.abs(maxDD) : 0;

  // Beta = cov(port, spy) / var(spy) using aligned daily returns.
  const n = Math.min(portRet.length, spyRet.length);
  const p = portRet.slice(-n), s = spyRet.slice(-n);
  const pm = mean(p), sm = mean(s);
  let cov = 0, varS = 0;
  for (let i = 0; i < n; i++) {
    cov += (p[i] - pm) * (s[i] - sm);
    varS += (s[i] - sm) ** 2;
  }
  const beta = varS > 0 ? cov / varS : 0;

  const spyAnnReturn = (1 + mean(spyRet)) ** 252 - 1;

  return {
    annualVol: Number(annVol.toFixed(4)),
    maxDrawdown: Number(maxDD.toFixed(4)),
    maxDrawdownStart: ddStart,
    maxDrawdownEnd: ddEnd,
    sharpe: Number(sharpe.toFixed(2)),
    sortino: Number(sortino.toFixed(2)),
    beta: Number(beta.toFixed(2)),
    calmar: Number(calmar.toFixed(2)),
    portfolioReturn: Number(annReturn.toFixed(4)),
    spyReturn: Number(spyAnnReturn.toFixed(4)),
    alphaVsSpy: Number((annReturn - spyAnnReturn).toFixed(4)),
    daysTracked: points.length,
  };
}
