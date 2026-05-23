import type { SectorExposure } from "@/lib/overlap";

// Soft / hard caps for any single GICS sector within the *equity sleeve*.
// Bonds and pure-international ETFs are exempt (they don't load into a single
// GICS sector).
export const SECTOR_SOFT_CAP = 0.25;
export const SECTOR_HARD_CAP = 0.35;

// Roles whose dominant exposure isn't a single GICS equity sector — these
// are exempted from sector cap checks.
const SLEEVE_EXEMPT_ROLES = new Set<string>([
  "Bond ballast / income",
  "International developed",
]);

// Map an ETF's role to its dominant GICS sector when sectorWeightings is
// empty (e.g. XAR returns no sectorWeightings from Yahoo).
const ROLE_TO_PRIMARY_SECTOR: Record<string, string> = {
  "US large-cap core":           "Technology",   // FELC ~30% tech by holdings
  "AI / mega-cap tech":          "Technology",   // QQQM
  "Semiconductors (AI infra)":   "Technology",   // SMH
  "Aerospace & defense":         "Industrials",  // XAR
  "Healthcare":                  "Healthcare",   // FHLC
  "Energy / inflation hedge":    "Energy",       // FENY
};

export interface SectorCapDecision {
  /** Multiplier ∈ [0, 1] to apply to the proposed buy dollars. 0 = hard block. */
  multiplier: number;
  /** Primary sector used in the decision (for display / explanation). */
  sector: string;
  /** Current portfolio-weighted exposure in `sector` before this buy. */
  currentSectorPct: number;
  /** Projected exposure after this buy if executed at full size. */
  projectedSectorPct: number;
  /** Human-readable explanation. */
  reason: string;
}

export function isSectorExempt(role: string): boolean {
  return SLEEVE_EXEMPT_ROLES.has(role);
}

function primarySectorFor(
  role: string,
  etfSectors: SectorExposure[],
): string {
  if (etfSectors.length > 0) {
    return [...etfSectors].sort((a, b) => b.effectiveWeight - a.effectiveWeight)[0].sector;
  }
  return ROLE_TO_PRIMARY_SECTOR[role] ?? "Unknown";
}

// Returns the multiplier and reason for a proposed BUY.
// - multiplier 1.0  → no cap concern
// - multiplier ∈ (0, 1) → soft cap: scale buy down to land exactly at 25%
// - multiplier 0.0 → hard cap (>35%): block
export function sectorCapMultiplier(args: {
  ticker: string;
  role: string;
  buyDollars: number;
  portfolioValue: number;
  // Portfolio-wide weighted sector exposures (from overlap.computeOverlap)
  currentSectorExposures: SectorExposure[];
  // Per-ETF sector weightings (for the ETF being bought) — used to attribute
  // the buy's dollar add to a single primary sector.
  buyEtfSectors: SectorExposure[];
}): SectorCapDecision {
  const { ticker, role, buyDollars, portfolioValue, currentSectorExposures, buyEtfSectors } = args;

  if (isSectorExempt(role)) {
    return {
      multiplier: 1.0,
      sector: "—",
      currentSectorPct: 0,
      projectedSectorPct: 0,
      reason: `${ticker}: ${role} sleeve — sector cap not applied.`,
    };
  }

  const sector = primarySectorFor(role, buyEtfSectors);
  if (sector === "Unknown" || portfolioValue <= 0) {
    return {
      multiplier: 1.0,
      sector,
      currentSectorPct: 0,
      projectedSectorPct: 0,
      reason: `${ticker}: insufficient data — sector cap skipped.`,
    };
  }

  const current = currentSectorExposures.find((s) => s.sector === sector)?.effectiveWeight ?? 0;
  const added = buyDollars / portfolioValue;
  const projected = current + added;

  if (projected > SECTOR_HARD_CAP) {
    return {
      multiplier: 0,
      sector,
      currentSectorPct: current,
      projectedSectorPct: projected,
      reason:
        `${sector} would reach ${(projected * 100).toFixed(1)}% ` +
        `(hard cap ${(SECTOR_HARD_CAP * 100).toFixed(0)}%). BUY blocked for ${ticker}.`,
    };
  }
  if (projected > SECTOR_SOFT_CAP) {
    const headroomDollars = Math.max(0, (SECTOR_SOFT_CAP - current) * portfolioValue);
    const scaled = Math.min(buyDollars, headroomDollars);
    const multiplier = buyDollars > 0 ? scaled / buyDollars : 0;
    return {
      multiplier: Math.max(0, Math.min(1, multiplier)),
      sector,
      currentSectorPct: current,
      projectedSectorPct: current + (scaled / portfolioValue),
      reason:
        `${sector} at ${(current * 100).toFixed(1)}% — soft cap ${(SECTOR_SOFT_CAP * 100).toFixed(0)}%. ` +
        `${ticker} buy scaled to $${Math.round(scaled).toLocaleString()} ` +
        `(was $${Math.round(buyDollars).toLocaleString()}).`,
    };
  }

  return {
    multiplier: 1.0,
    sector,
    currentSectorPct: current,
    projectedSectorPct: projected,
    reason: `${sector} at ${(current * 100).toFixed(1)}% — within ${(SECTOR_SOFT_CAP * 100).toFixed(0)}% cap.`,
  };
}
