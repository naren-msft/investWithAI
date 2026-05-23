import { getCloseSeries } from "@/lib/yahoo";

// Per-ETF beta vs SPY over 252 trading days using daily log returns.
// β = Cov(R_i, R_spy) / Var(R_spy)
const betaCache = new Map<string, { at: number; value: number }>();
const CACHE_MS = 60 * 60 * 1000;

export async function computeEtfBeta(ticker: string): Promise<number> {
  if (ticker === "SPY") return 1.0;
  const cached = betaCache.get(ticker);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const MONTHS = 13;
  const [asset, spy] = await Promise.all([
    getCloseSeries(ticker, MONTHS),
    getCloseSeries("SPY", MONTHS),
  ]);
  const n = Math.min(asset.length, spy.length, 252);
  if (n < 30) {
    betaCache.set(ticker, { at: Date.now(), value: NaN });
    return NaN;
  }
  const a = asset.slice(-n);
  const s = spy.slice(-n);
  const rA: number[] = [];
  const rS: number[] = [];
  for (let i = 1; i < n; i++) {
    if (a[i - 1] > 0 && s[i - 1] > 0 && a[i] > 0 && s[i] > 0) {
      rA.push(Math.log(a[i] / a[i - 1]));
      rS.push(Math.log(s[i] / s[i - 1]));
    }
  }
  if (rA.length < 30) return NaN;
  const meanA = rA.reduce((x, y) => x + y, 0) / rA.length;
  const meanS = rS.reduce((x, y) => x + y, 0) / rS.length;
  let cov = 0;
  let varS = 0;
  for (let i = 0; i < rA.length; i++) {
    cov += (rA[i] - meanA) * (rS[i] - meanS);
    varS += (rS[i] - meanS) ** 2;
  }
  const beta = varS > 0 ? cov / varS : 1.0;
  betaCache.set(ticker, { at: Date.now(), value: beta });
  return beta;
}

export interface PortfolioBetaResult {
  portfolioBeta: number;
  etfBetas: Record<string, number>;
}

// Portfolio beta = Σ(weight_i × β_i). Caller controls weighting basis (target
// vs. current allocation).
export async function computePortfolioBeta(
  positions: { ticker: string; weight: number }[],
): Promise<PortfolioBetaResult> {
  const results = await Promise.all(
    positions.map(async ({ ticker, weight }) => ({
      ticker,
      weight,
      beta: await computeEtfBeta(ticker),
    })),
  );
  const etfBetas: Record<string, number> = {};
  let portfolioBeta = 0;
  for (const { ticker, weight, beta } of results) {
    const safe = Number.isFinite(beta) ? beta : 1.0;
    etfBetas[ticker] = safe;
    portfolioBeta += weight * safe;
  }
  return { portfolioBeta, etfBetas };
}
