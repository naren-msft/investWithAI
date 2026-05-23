import { getCloseSeries } from "@/lib/yahoo";

// Forward-looking historical drawdown stats for an ETF using 3 years of
// daily closes. Two metrics:
//   1) worstRolling12mo  — empirical worst 252-trading-day return.
//   2) parametric2Sigma  — −2 × σ_daily × √252 (normal-distribution floor).
//
// The empirical metric is more honest about fat tails (2022 QQQM was ~-47%
// realized vs. parametric ~-35%). Both are surfaced together.

const ddCache = new Map<string, { at: number; value: EtfDrawdownStats }>();
const CACHE_MS = 60 * 60 * 1000;

export interface EtfDrawdownStats {
  ticker: string;
  worstRolling12mo: number;
  parametric2Sigma: number;
  sampleDays: number;
}

export function worstRolling12mo(closes: number[]): number {
  const W = 252;
  if (closes.length < W) return NaN;
  let worst = 0;
  for (let i = 0; i <= closes.length - W; i++) {
    const start = closes[i];
    const end = closes[i + W - 1];
    if (start > 0) {
      const ret = end / start - 1;
      if (ret < worst) worst = ret;
    }
  }
  return worst;
}

export function parametric2SigmaAnnualDD(closes: number[]): number {
  if (closes.length < 30) return NaN;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const m = rets.reduce((x, y) => x + y, 0) / rets.length;
  const v = rets.reduce((s, r) => s + (r - m) ** 2, 0) / rets.length;
  const sigma = Math.sqrt(v);
  return -2 * sigma * Math.sqrt(252);
}

export async function computeEtfDrawdownStats(ticker: string): Promise<EtfDrawdownStats> {
  const cached = ddCache.get(ticker);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const closes = await getCloseSeries(ticker, 36);
  const value: EtfDrawdownStats = {
    ticker,
    worstRolling12mo: worstRolling12mo(closes),
    parametric2Sigma: parametric2SigmaAnnualDD(closes),
    sampleDays: closes.length,
  };
  ddCache.set(ticker, { at: Date.now(), value });
  return value;
}
