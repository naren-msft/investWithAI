import YahooFinance from "yahoo-finance2";
import type { TargetWeight } from "@/types";

const yahooFinance = new YahooFinance();
// @ts-ignore
yahooFinance.suppressNotices?.(["yahooSurvey", "ripHistorical"]);

export interface UnderlyingHolding {
  symbol: string;
  name: string;
  weightInEtf: number;
}

export interface SectorWeighting {
  sector: string;
  weight: number;
}

export interface EtfHoldings {
  ticker: string;
  topHoldings: UnderlyingHolding[];
  sectorWeightings: SectorWeighting[];
  stockPosition?: number;
  bondPosition?: number;
  cashPosition?: number;
}

const cache = new Map<string, { at: number; value: EtfHoldings }>();
const CACHE_MS = 60 * 60 * 1000; // 1 hour — holdings change slowly

export async function getEtfHoldings(ticker: string): Promise<EtfHoldings> {
  const c = cache.get(ticker);
  if (c && Date.now() - c.at < CACHE_MS) return c.value;
  try {
    const res: any = await yahooFinance.quoteSummary(ticker, {
      modules: ["topHoldings"] as any,
    });
    const th: any = res.topHoldings ?? {};
    const holdings: UnderlyingHolding[] = (th.holdings ?? []).map((h: any) => ({
      symbol: h.symbol ?? "",
      name: h.holdingName ?? h.symbol ?? "",
      weightInEtf: Number(h.holdingPercent ?? 0),
    }));
    const sectors: SectorWeighting[] = (th.sectorWeightings ?? []).flatMap((s: any) => {
      // sectorWeightings is an array of single-key objects: [{ realestate: 0.02 }, ...]
      return Object.entries(s).map(([k, v]) => ({ sector: prettySector(k), weight: Number(v) }));
    });
    const value: EtfHoldings = {
      ticker,
      topHoldings: holdings,
      sectorWeightings: sectors,
      stockPosition: Number(th.stockPosition ?? 0),
      bondPosition: Number(th.bondPosition ?? 0),
      cashPosition: Number(th.cashPosition ?? 0),
    };
    cache.set(ticker, { at: Date.now(), value });
    return value;
  } catch {
    const empty: EtfHoldings = { ticker, topHoldings: [], sectorWeightings: [] };
    cache.set(ticker, { at: Date.now(), value: empty });
    return empty;
  }
}

function prettySector(key: string): string {
  const map: Record<string, string> = {
    realestate: "Real Estate",
    consumer_cyclical: "Consumer Cyclical",
    basic_materials: "Basic Materials",
    consumer_defensive: "Consumer Defensive",
    technology: "Technology",
    communication_services: "Communication Services",
    financial_services: "Financial Services",
    utilities: "Utilities",
    industrials: "Industrials",
    energy: "Energy",
    healthcare: "Healthcare",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

export interface StockExposure {
  symbol: string;
  name: string;
  effectiveWeight: number;        // % of total portfolio represented by this stock (across all ETFs)
  contributors: { ticker: string; weightInEtf: number; portfolioWeight: number; contribution: number }[];
}

export interface SectorExposure {
  sector: string;
  effectiveWeight: number;
}

export interface OverlapResult {
  asOf: string;
  topStockExposures: StockExposure[];   // top 12 underlying single-stock concentrations
  sectorExposures: SectorExposure[];    // aggregated sector weights
  etfHoldings: EtfHoldings[];           // raw per-ETF data for transparency
  totalTopHoldingsCoverage: number;     // fraction of portfolio covered by top-10 data (most ETFs only expose top 10)
}

export async function computeOverlap(targets: readonly TargetWeight[]): Promise<OverlapResult> {
  const etfHoldings = await Promise.all(targets.map((t) => getEtfHoldings(t.ticker)));

  // Aggregate single-stock exposures: for each stock S, effective = Σ (portfolioWeight(ETF) × weightInEtf(S, ETF))
  const byStock = new Map<string, StockExposure>();
  let covered = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const h = etfHoldings[i];
    const topSum = h.topHoldings.reduce((s, x) => s + x.weightInEtf, 0);
    covered += t.weight * topSum;
    for (const x of h.topHoldings) {
      if (!x.symbol) continue;
      const contribution = t.weight * x.weightInEtf;
      const key = x.symbol;
      const cur = byStock.get(key) ?? {
        symbol: x.symbol,
        name: x.name,
        effectiveWeight: 0,
        contributors: [],
      };
      cur.effectiveWeight += contribution;
      cur.contributors.push({
        ticker: t.ticker,
        weightInEtf: x.weightInEtf,
        portfolioWeight: t.weight,
        contribution,
      });
      byStock.set(key, cur);
    }
  }
  const topStockExposures = Array.from(byStock.values())
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight)
    .slice(0, 12);

  // Aggregate sectors.
  const bySector = new Map<string, number>();
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    for (const s of etfHoldings[i].sectorWeightings) {
      bySector.set(s.sector, (bySector.get(s.sector) ?? 0) + t.weight * s.weight);
    }
  }
  const sectorExposures: SectorExposure[] = Array.from(bySector, ([sector, effectiveWeight]) => ({ sector, effectiveWeight }))
    .filter((x) => x.effectiveWeight > 0)
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight);

  return {
    asOf: new Date().toISOString(),
    topStockExposures,
    sectorExposures,
    etfHoldings,
    totalTopHoldingsCoverage: covered,
  };
}
