import { getCloseSeries } from "@/lib/yahoo";

// Per-ETF beta vs SPY over 252 trading days using daily log returns.
// β = Cov(R_i, R_spy) / Var(R_spy)
const betaCache = new Map<string, { at: number; value: number }>();
const CACHE_MS = 60 * 60 * 1000;

// Tier-based beta fallbacks. When a regression returns NaN (insufficient
// history — common for IPO-era names like CRWV / RBRK or 3× ETFs whose
// linear-beta breaks down), we use a conviction-tier prior instead of
// silently defaulting to 1.0 (which would dramatically understate portfolio
// risk for speculative + leveraged names).
//
// Tuning: tier defaults below were chosen to bracket realized 1y beta for
// representative names from the user's universe (Jan 2024 – Nov 2025):
//   • core (NVDA 1.7, AVGO 1.4, GOOGL 1.1)            → 1.2 prior
//   • growth (PLTR 2.3, RBRK n/a, CRWV n/a)           → 1.8 prior
//   • speculative (HOOD 2.4, FUBO 2.8, NBIS n/a)      → 2.5 prior
// Leveraged ETFs (SOXL, TQQQ) get a hard 3.0 override regardless of tier
// because daily-reset 3× products have explicit 3× exposure by design.
const LEVERAGED_TICKERS = new Set(["SOXL", "TQQQ", "UPRO", "TNA", "FNGU", "LABU"]);
const TIER_BETA_PRIOR: Record<string, number> = {
  core: 1.2,
  growth: 1.8,
  speculative: 2.5,
};

export function tierBetaFallback(tier?: string, ticker?: string): number {
  if (ticker && LEVERAGED_TICKERS.has(ticker)) return 3.0;
  if (tier && TIER_BETA_PRIOR[tier] != null) return TIER_BETA_PRIOR[tier];
  return 1.0;
}

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
// vs. current allocation). Per-position `tier` is used as a fallback when the
// regression returns NaN (insufficient price history).
export async function computePortfolioBeta(
  positions: { ticker: string; weight: number; tier?: string }[],
): Promise<PortfolioBetaResult> {
  const results = await Promise.all(
    positions.map(async ({ ticker, weight, tier }) => ({
      ticker,
      weight,
      tier,
      beta: await computeEtfBeta(ticker),
    })),
  );
  const etfBetas: Record<string, number> = {};
  let portfolioBeta = 0;
  for (const { ticker, weight, tier, beta } of results) {
    const safe = Number.isFinite(beta) ? beta : tierBetaFallback(tier, ticker);
    etfBetas[ticker] = safe;
    portfolioBeta += weight * safe;
  }
  return { portfolioBeta, etfBetas };
}
