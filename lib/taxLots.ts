import { getQuotes } from "@/lib/yahoo";
import { readExecutions, type Execution } from "@/lib/store";
import { TARGETS } from "@/config/portfolio";

export interface TaxLot extends Execution {
  currentPrice: number;
  currentValue: number;
  costBasis: number;            // shares × price (original)
  unrealizedGain: number;        // currentValue - costBasis
  unrealizedGainPct: number;
  daysHeld: number;
  isLongTerm: boolean;            // daysHeld >= 366 (US: > 1 year)
  daysUntilLT: number;            // days until it crosses LTCG (negative if already LT)
  isTLHCandidate: boolean;        // unrealized loss > $100
}

export interface TaxReport {
  lots: TaxLot[];
  totals: {
    costBasis: number;
    marketValue: number;
    unrealizedGain: number;
    unrealizedGainPct: number;
    unrealizedSTCG: number;       // sum of gains (>0) where !isLongTerm
    unrealizedLTCG: number;       // sum of gains (>0) where isLongTerm
    unrealizedLoss: number;       // sum of losses (negative number)
    tlhOpportunity: number;       // sum of unrealizedLoss across candidates (positive number, the $ harvestable)
    stcgTaxEstSavingsIfHeld: number; // estimate of tax saved if STCG lots crossed to LTCG (delta in tax rate × gain)
  };
  topTLHCandidates: TaxLot[];      // top 5 by absolute loss
  approachingLT: TaxLot[];          // lots within 60 days of LTCG
}

const STCG_RATE = 0.37;  // top marginal
const LTCG_RATE = 0.20;  // top LT rate
const TLH_THRESHOLD = 100;  // $ unrealized loss threshold

export async function computeTaxReport(now: Date = new Date()): Promise<TaxReport> {
  const [execs, quotes] = await Promise.all([
    readExecutions(),
    getQuotes(TARGETS.map((t) => t.ticker as string)),
  ]);
  const priceByTicker = new Map(quotes.map((q) => [q.ticker, q.price]));
  const nowMs = now.getTime();

  const lots: TaxLot[] = execs.map((e) => {
    const price = priceByTicker.get(e.ticker) ?? 0;
    const costBasis = e.shares * e.price;
    const currentValue = e.shares * price;
    const unrealizedGain = currentValue - costBasis;
    const dateMs = new Date(e.date).getTime();
    const daysHeld = Math.max(0, Math.floor((nowMs - dateMs) / (24 * 60 * 60 * 1000)));
    const isLongTerm = daysHeld >= 366;
    return {
      ...e,
      currentPrice: price,
      currentValue: round2(currentValue),
      costBasis: round2(costBasis),
      unrealizedGain: round2(unrealizedGain),
      unrealizedGainPct: costBasis > 0 ? Number((unrealizedGain / costBasis).toFixed(4)) : 0,
      daysHeld,
      isLongTerm,
      daysUntilLT: 366 - daysHeld,
      isTLHCandidate: unrealizedGain < -TLH_THRESHOLD,
    };
  });

  // Aggregate totals.
  let costBasis = 0, marketValue = 0, unrealizedSTCG = 0, unrealizedLTCG = 0, unrealizedLoss = 0, tlhOpportunity = 0;
  for (const l of lots) {
    costBasis += l.costBasis;
    marketValue += l.currentValue;
    if (l.unrealizedGain > 0) {
      if (l.isLongTerm) unrealizedLTCG += l.unrealizedGain;
      else unrealizedSTCG += l.unrealizedGain;
    } else if (l.unrealizedGain < 0) {
      unrealizedLoss += l.unrealizedGain;
      if (l.isTLHCandidate) tlhOpportunity += -l.unrealizedGain;
    }
  }
  const unrealizedGain = marketValue - costBasis;
  // If the user holds STCG lots until they cross to LT, tax rate falls by (STCG - LTCG).
  const stcgTaxEstSavingsIfHeld = unrealizedSTCG * (STCG_RATE - LTCG_RATE);

  const topTLHCandidates = [...lots].filter((l) => l.isTLHCandidate).sort((a, b) => a.unrealizedGain - b.unrealizedGain).slice(0, 5);
  const approachingLT = [...lots].filter((l) => !l.isLongTerm && l.daysUntilLT <= 60).sort((a, b) => a.daysUntilLT - b.daysUntilLT);

  return {
    lots: lots.sort((a, b) => b.date.localeCompare(a.date)),
    totals: {
      costBasis: round2(costBasis),
      marketValue: round2(marketValue),
      unrealizedGain: round2(unrealizedGain),
      unrealizedGainPct: costBasis > 0 ? Number((unrealizedGain / costBasis).toFixed(4)) : 0,
      unrealizedSTCG: round2(unrealizedSTCG),
      unrealizedLTCG: round2(unrealizedLTCG),
      unrealizedLoss: round2(unrealizedLoss),
      tlhOpportunity: round2(tlhOpportunity),
      stcgTaxEstSavingsIfHeld: round2(stcgTaxEstSavingsIfHeld),
    },
    topTLHCandidates,
    approachingLT,
  };
}

function round2(n: number): number { return Number(n.toFixed(2)); }
