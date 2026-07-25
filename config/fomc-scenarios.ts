import type { TargetWeight, ConvictionTier, Tranche } from "@/types";

// =============================================================================
// FOMC June-17 deployment playbook — three target portfolios per scenario.
//
// Each "scenario" (CUT / HOLD / HIKE) defines what the $700K target portfolio
// should look like AFTER the FOMC tells us which world we're in. The active
// scenario is selected via URL param `?scenario=hold|cut|hike|neutral`. The
// FOMC route's page handler swaps `base.targets` weights according to the
// selected scenario before calling runPipeline, so the existing pipeline /
// drift / signal / deployment agents need no changes.
//
// Weights below come directly from the v4 FOMC playbook (Section 3 deployment
// table). Sums equal 1.00 for each scenario (sanity-check at bottom of file).
//
// NEUTRAL is the pre-FOMC build: half-sized Tier-1 cores + moderate hedges/
// leverage. After
// June 17 the user pivots to the column matching reality.
// =============================================================================

export type FomcScenarioId = "neutral" | "cut" | "hold" | "hike";

export interface FomcScenarioMeta {
  id: FomcScenarioId;
  label: string;
  shortLabel: string;
  probability: number;     // 0..1 — for probability-weighted expected return
  spyMovePct: number;      // assumed 1yr SPY move under this scenario
  description: string;
  // Colour token for badges. Maps to existing palette classes in the dashboard.
  accent: "blue" | "green" | "amber" | "red";
}

export const FOMC_SCENARIOS: Record<FomcScenarioId, FomcScenarioMeta> = {
  neutral: {
    id: "neutral",
    label: "Pre-FOMC · Neutral",
    shortLabel: "Pre-FOMC",
    probability: 0,        // not a scenario, just the holding pattern
    spyMovePct: 0,
    description: "Half-sized Tier-1 AI cores only — user removed gold + leveraged ETFs. Deploy now → June 16. No bet on outcome yet.",
    accent: "blue",
  },
  cut: {
    id: "cut",
    label: "Path A — Fed cuts / dovish hold",
    shortLabel: "CUT",
    probability: 0.20,
    spyMovePct: 0.18,
    description: "1–2 cuts by Dec or strong dovish guidance. Risk-on: max equity, lean into rate-sensitive growth + crypto.",
    accent: "green",
  },
  hold: {
    id: "hold",
    label: "Path B — Hawkish hold",
    shortLabel: "HOLD",
    probability: 0.35,
    spyMovePct: 0.06,
    description: "No move June, data-dependent through Dec. Range-bound: balanced AI quality cores; dry powder held via Phase 3-4 timing rather than a cash or hedge target.",
    accent: "amber",
  },
  hike: {
    id: "hike",
    label: "Path C — Hike (modal)",
    shortLabel: "HIKE",
    probability: 0.45,
    spyMovePct: -0.10,
    description: "1+ hike by year-end. Defensive: trim speculative + quantum names, concentrate into highest-quality cores (no gold/ETF hedges available per user request — caps clamp single-name exposure).",
    accent: "red",
  },
};

// =============================================================================
// Per-scenario target weights. Each column sums to 1.00. Tickers absent from a
// column have weight 0 in that scenario (still present in universe — pipeline
// will show "not in plan" rather than drop them).
// =============================================================================

// Helper for terse weight tables. Maps ticker → weight (decimal).
type WeightMap = Record<string, number>;

// =============================================================================
// User requested removal (Jun 11 2026): FUBO + all ETF/fund tickers (IAU gold
// ETF, INFQ sector fund, SOXL/TQQQ 3× leveraged ETFs). Weights renormalized
// so each scenario column sums to 1.0. NOTE: with the gold hedge gone, HIKE
// scenario tilts heavier into AI cores than originally intended — per-name
// maxPositionPct caps in executionDecision will clamp single-name exposure
// (e.g. NVDA target 20% → capped at 14%), so dollars roll to the next name.
// =============================================================================

const NEUTRAL_WEIGHTS: WeightMap = {
  NVDA: 0.1622, AVGO: 0.1216, GOOGL: 0.1216, TSM: 0.0946, ASML: 0.0811, ANET: 0.0676,
  PLTR: 0.0541, RBRK: 0.0405, CRWV: 0.0405,
  IONQ: 0.0338, RGTI: 0.0203, QBTS: 0.0203, QNC: 0.0135, LAES: 0.0135, ARQQ: 0.0135,
  BE: 0.0405, BMNR: 0.027, INDI: 0.0068, ZENA: 0.0068,
  QNT: 0.0203,
};

const CUT_WEIGHTS: WeightMap = {
  // Fed cuts → risk-on, max core AI
  NVDA: 0.1718, AVGO: 0.1227, GOOGL: 0.1227, TSM: 0.0982, ASML: 0.0859, ANET: 0.0736,
  PLTR: 0.0491, RBRK: 0.0368, CRWV: 0.0491,
  IONQ: 0.0245, RGTI: 0.0184, QBTS: 0.0184, QNC: 0.0123, LAES: 0.0123, ARQQ: 0.0123,
  BE: 0.0368, BMNR: 0.0184, INDI: 0.0061, ZENA: 0.0061,
  QNT: 0.0245,
};

const HOLD_WEIGHTS: WeightMap = {
  // Fed holds → balanced (no defensives — user removed hedges)
  NVDA: 0.1797, AVGO: 0.1328, GOOGL: 0.1328, TSM: 0.0938, ASML: 0.0781, ANET: 0.0625,
  PLTR: 0.0469, RBRK: 0.0391, CRWV: 0.0312,
  IONQ: 0.0312, RGTI: 0.0156, QBTS: 0.0156, QNC: 0.0078, LAES: 0.0078, ARQQ: 0.0078,
  BE: 0.0391, BMNR: 0.0234, INDI: 0.0078, ZENA: 0.0078,
  QNT: 0.0391,
};

const HIKE_WEIGHTS: WeightMap = {
  // Fed hikes → defensive, but with no gold/ETFs the only defense is to size
  // down speculative + concentrate into highest-quality cores. Per-name caps
  // (executionDecision) will clamp NVDA → 14% etc., the residual rolls to AVGO/GOOGL.
  NVDA: 0.20, AVGO: 0.14, GOOGL: 0.16, TSM: 0.08, ASML: 0.08, ANET: 0.06,
  PLTR: 0.04, RBRK: 0.04, CRWV: 0.02,
  IONQ: 0.02, RGTI: 0.01, QBTS: 0.01, QNC: 0.01, LAES: 0.01, ARQQ: 0.01,
  BE: 0.04, BMNR: 0.01, INDI: 0.01, ZENA: 0.01,
  QNT: 0.04,
};

export const FOMC_SCENARIO_WEIGHTS: Record<FomcScenarioId, WeightMap> = {
  neutral: NEUTRAL_WEIGHTS,
  cut: CUT_WEIGHTS,
  hold: HOLD_WEIGHTS,
  hike: HIKE_WEIGHTS,
};

// Run-time sanity check at module load. Each column must sum to ~1.0.
for (const [sid, w] of Object.entries(FOMC_SCENARIO_WEIGHTS)) {
  const s = Object.values(w).reduce((a, b) => a + b, 0);
  if (Math.abs(s - 1) > 1e-9) {
    // eslint-disable-next-line no-console
    console.warn(`[fomc-scenarios] ${sid} weights sum to ${s.toFixed(9)}, expected 1.0`);
  }
}

// =============================================================================
// Ticker universe metadata. Used to build TargetWeight[] when the page
// handler picks an active scenario. The base config (config/fomc.ts) imports
// this and assembles the full bundle.
// =============================================================================

export interface FomcTickerMeta {
  ticker: string;
  name: string;
  tier: ConvictionTier;
  role: string;
  maxPositionPct: number;
  // Notes shown in the Phase-1 buy-ticket panel.
  limitPctBelowMid?: number; // e.g. 0.02 = limit order at -2% of mid
}

// =============================================================================
// User-ONLY ticker universe — strictly from the WhatsApp portfolio screenshots
// (v3 PDF intake). No model additions, no cash placeholders, no diversifier
// ETFs unless the user already holds them. Cash sits in the broker, not as a
// ticker; deployment is driven by the tranche schedule + scenario weights.
// =============================================================================
export const FOMC_UNIVERSE: ReadonlyArray<FomcTickerMeta> = [
  // ── Tier 1 — Core AI compounders ──────────────────────────────────────────
  { ticker: "NVDA",  name: "NVIDIA Corporation",     tier: "core",        role: "AI accelerator",        maxPositionPct: 0.14, limitPctBelowMid: 0.02  },
  { ticker: "AVGO",  name: "Broadcom Inc.",          tier: "core",        role: "AI networking semi",    maxPositionPct: 0.10, limitPctBelowMid: 0.015 },
  { ticker: "GOOGL", name: "Alphabet Class A",       tier: "core",        role: "AI mega-cap (voting)",  maxPositionPct: 0.10, limitPctBelowMid: 0.015 },
  { ticker: "TSM",   name: "Taiwan Semiconductor",   tier: "core",        role: "Foundry",               maxPositionPct: 0.08, limitPctBelowMid: 0.02  },
  { ticker: "ASML",  name: "ASML Holding",           tier: "core",        role: "Litho equipment",       maxPositionPct: 0.07, limitPctBelowMid: 0.02  },
  { ticker: "ANET",  name: "Arista Networks",        tier: "core",        role: "AI networking",         maxPositionPct: 0.06, limitPctBelowMid: 0.015 },

  // ── Tier 2 — Quality growth ───────────────────────────────────────────────
  { ticker: "PLTR",  name: "Palantir Technologies",  tier: "growth",      role: "AI software",           maxPositionPct: 0.04 },
  { ticker: "RBRK",  name: "Rubrik",                 tier: "growth",      role: "AI data security",      maxPositionPct: 0.04 },
  { ticker: "CRWV",  name: "CoreWeave",              tier: "growth",      role: "AI cloud / GPU lease",  maxPositionPct: 0.04 },

  // ── Tier 3 — Speculative ──────────────────────────────────────────────────
  { ticker: "IONQ",  name: "IonQ",                   tier: "speculative", role: "Quantum compute",       maxPositionPct: 0.03  },
  { ticker: "RGTI",  name: "Rigetti Computing",      tier: "speculative", role: "Quantum compute",       maxPositionPct: 0.02  },
  { ticker: "QBTS",  name: "D-Wave Quantum",         tier: "speculative", role: "Quantum compute",       maxPositionPct: 0.02  },
  { ticker: "QNC",   name: "Quantum eMotion",        tier: "speculative", role: "Quantum compute",       maxPositionPct: 0.015 },
  { ticker: "LAES",  name: "SEALSQ",                 tier: "speculative", role: "Quantum-safe security", maxPositionPct: 0.015 },
  { ticker: "ARQQ",  name: "Arqit Quantum",          tier: "speculative", role: "Quantum-safe security", maxPositionPct: 0.015 },
  { ticker: "BE",    name: "Bloom Energy",           tier: "speculative", role: "AI power / fuel cells", maxPositionPct: 0.035 },
  { ticker: "BMNR",  name: "BitMine Immersion",      tier: "speculative", role: "BTC miner",             maxPositionPct: 0.02  },
  { ticker: "INDI",  name: "indie Semiconductor",    tier: "speculative", role: "Auto-semi",             maxPositionPct: 0.01  },
  { ticker: "ZENA",  name: "ZenaTech",               tier: "speculative", role: "AI drones",             maxPositionPct: 0.01  },

  // ── User's other holdings (non-ETF) ───────────────────────────────────────
  { ticker: "QNT",   name: "Quant",                  tier: "speculative", role: "Crypto / network",      maxPositionPct: 0.03 },
];

// =============================================================================
// Sleeve grouping for the exposure panel (groups tickers by FOMC role).
// =============================================================================

export type FomcSleeve =
  | "core-ai-semi"
  | "growth"
  | "speculative";

export const FOMC_SLEEVE_LABEL: Record<FomcSleeve, string> = {
  "core-ai-semi": "Core AI / Semi",
  "growth":       "Quality Growth",
  "speculative":  "Speculative (capped)",
};

export const FOMC_ROLE_TO_SLEEVE: Record<string, FomcSleeve> = {
  "AI accelerator":          "core-ai-semi",
  "AI networking semi":      "core-ai-semi",
  "AI mega-cap (voting)":    "core-ai-semi",
  "Foundry":                 "core-ai-semi",
  "Litho equipment":         "core-ai-semi",
  "AI networking":           "core-ai-semi",
  "AI software":             "growth",
  "AI data security":        "growth",
  "AI cloud / GPU lease":    "growth",
  "Quantum compute":         "speculative",
  "Quantum-safe security":   "speculative",
  "AI power / fuel cells":   "speculative",
  "BTC miner":               "speculative",
  "Auto-semi":               "speculative",
  "AI drones":               "speculative",
  "Crypto / network":        "speculative",
};

// Sleeve caps (decimal of total portfolio value). Cash sits in broker (not
// modeled as a ticker), so no cash-equiv sleeve. After removing ETF/hedge
// names the user kept only single-stock + crypto exposure, so caps are
// re-allocated across the 3 active sleeves.
export const FOMC_SLEEVE_CAPS = {
  "core-ai-semi": { hardPct: 0.70, softPct: 0.65 },
  "growth":       { hardPct: 0.25 },
  "speculative":  { hardPct: 0.30 },
} as const;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build the TargetWeight[] for the active scenario. Tickers absent from the
 * scenario column get weight 0 (still present, so pipeline reports drift).
 */
export function buildFomcTargets(scenario: FomcScenarioId): TargetWeight[] {
  const weights = FOMC_SCENARIO_WEIGHTS[scenario];
  return FOMC_UNIVERSE.map((u) => ({
    ticker: u.ticker,
    name: u.name,
    weight: weights[u.ticker] ?? 0,
    expense: 0,
    role: u.role,
    tier: u.tier,
    maxPositionPct: u.maxPositionPct,
  }));
}

/** Parse the URL `?scenario=` param defensively. */
export function parseScenario(raw: unknown): FomcScenarioId {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "cut" || s === "hold" || s === "hike" || s === "neutral") return s;
  return "neutral";
}
