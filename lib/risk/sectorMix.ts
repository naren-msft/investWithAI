import type { SectorExposure } from "@/lib/overlap";

// Bucket GICS-ish sectors into the 3 high-level categories investors mentally
// use ("Tech vs Defensive vs Cyclical"). Anything that isn't recognized lands
// in `other` so totals always sum to the same number.

export type SectorCategory = "tech" | "defensive" | "cyclical" | "other";

const CATEGORY: Record<string, SectorCategory> = {
  "Technology":             "tech",
  "Communication Services": "tech",
  "Healthcare":             "defensive",
  "Consumer Defensive":     "defensive",
  "Utilities":              "defensive",
  "Financial Services":     "cyclical",
  "Consumer Cyclical":      "cyclical",
  "Industrials":            "cyclical",
  "Energy":                 "cyclical",
  "Basic Materials":        "cyclical",
  "Real Estate":            "cyclical",
};

export function categoryFor(sector: string): SectorCategory {
  return CATEGORY[sector] ?? "other";
}

export interface SectorMix {
  tech: number;
  defensive: number;
  cyclical: number;
  other: number;
  topSectors: SectorExposure[];
}

// Aggregate the per-sector overlap exposures into 3 categories + top-N list.
// All weights are *of target portfolio*, so they sum to the equity portion
// (bonds/cash drag the total below 1.0).
export function sectorMixFromExposures(sectors: SectorExposure[]): SectorMix {
  const acc: SectorMix = { tech: 0, defensive: 0, cyclical: 0, other: 0, topSectors: [] };
  for (const s of sectors) {
    acc[categoryFor(s.sector)] += s.effectiveWeight;
  }
  acc.topSectors = [...sectors]
    .filter((s) => s.effectiveWeight > 0)
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight)
    .slice(0, 6);
  return acc;
}
