import type { PortfolioConfig, TargetWeight, Tranche } from "@/types";
import type { PortfolioBundle, SleeveCap } from "./bundle";
import { buildTranches } from "./portfolio";

// Stock portfolio sizing — separate from the ETF sleeve. Override at runtime
// via the in-app capital editor or via STOCK_CAPITAL / STOCK_CASH_BUFFER envs.
export const STOCK_DEFAULT_CAPITAL = Number(process.env.STOCK_CAPITAL ?? 50_000);
export const STOCK_DEFAULT_CASH_BUFFER = Number(process.env.STOCK_CASH_BUFFER ?? 10_000);

// 19-stock universe (validated 2026-05-23 against Yahoo Finance). Weights are
// tiered by conviction (Core 60% / Growth 22% / Speculative 18%) and grouped
// into themed sleeves with per-sleeve caps. Per-name `maxPositionPct` enforces
// a hard cap on each speculative name's drift-driven sizing.
//
// Tier → signal thresholds (lib/agents/signalAnalysis.ts):
//   core         RSI BUY ≤ 35,  AVOID ≥ 70
//   growth       RSI BUY ≤ 30,  AVOID ≥ 75
//   speculative  RSI BUY ≤ 25,  AVOID ≥ 80  + require MACD hist > 0 for BUY
export const STOCK_TARGETS: ReadonlyArray<TargetWeight> = [
  // Core — AI infrastructure semis & power (60%)
  { ticker: "NVDA", name: "NVIDIA Corporation",                       weight: 0.14, expense: 0, role: "AI accelerator",          tier: "core",        maxPositionPct: 0.16 },
  { ticker: "AVGO", name: "Broadcom Inc.",                            weight: 0.10, expense: 0, role: "AI networking semi",      tier: "core",        maxPositionPct: 0.12 },
  { ticker: "TSM",  name: "Taiwan Semiconductor",                     weight: 0.10, expense: 0, role: "Foundry",                 tier: "core",        maxPositionPct: 0.12 },
  { ticker: "ASML", name: "ASML Holding",                             weight: 0.08, expense: 0, role: "Litho equipment",         tier: "core",        maxPositionPct: 0.10 },
  { ticker: "MU",   name: "Micron Technology",                        weight: 0.06, expense: 0, role: "HBM / memory",            tier: "core",        maxPositionPct: 0.08 },
  { ticker: "VRT",  name: "Vertiv Holdings",                          weight: 0.07, expense: 0, role: "Data center power/cooling", tier: "core",      maxPositionPct: 0.09 },
  { ticker: "BE",   name: "Bloom Energy",                             weight: 0.05, expense: 0, role: "AI power / fuel cells",   tier: "core",        maxPositionPct: 0.07 },

  // Growth — AI software, cloud, optics, auto-semi (22%)
  { ticker: "RBRK", name: "Rubrik",                                   weight: 0.07, expense: 0, role: "AI data security",        tier: "growth",      maxPositionPct: 0.08 },
  { ticker: "CRWV", name: "CoreWeave",                                weight: 0.08, expense: 0, role: "AI cloud / GPU lease",    tier: "growth",      maxPositionPct: 0.10 },
  { ticker: "AAOI", name: "Applied Optoelectronics",                  weight: 0.04, expense: 0, role: "AI optics",               tier: "growth",      maxPositionPct: 0.06 },
  { ticker: "INDI", name: "indie Semiconductor",                      weight: 0.03, expense: 0, role: "Auto-semi",               tier: "growth",      maxPositionPct: 0.05 },

  // Speculative — Quantum compute & quantum-safe security (18%)
  { ticker: "IONQ", name: "IonQ",                                     weight: 0.03, expense: 0, role: "Quantum compute",         tier: "speculative", maxPositionPct: 0.04 },
  { ticker: "RGTI", name: "Rigetti Computing",                        weight: 0.02, expense: 0, role: "Quantum compute",         tier: "speculative", maxPositionPct: 0.03 },
  { ticker: "QBTS", name: "D-Wave Quantum",                           weight: 0.02, expense: 0, role: "Quantum compute",         tier: "speculative", maxPositionPct: 0.03 },
  { ticker: "QNC",  name: "Quantum eMotion",                          weight: 0.02, expense: 0, role: "Quantum compute",         tier: "speculative", maxPositionPct: 0.03 },
  { ticker: "LAES", name: "SEALSQ",                                   weight: 0.02, expense: 0, role: "Quantum-safe security",   tier: "speculative", maxPositionPct: 0.03 },
  { ticker: "BTQ",  name: "BTQ Technologies",                         weight: 0.02, expense: 0, role: "Quantum-safe security",   tier: "speculative", maxPositionPct: 0.03 },
  { ticker: "ARQQ", name: "Arqit Quantum",                            weight: 0.02, expense: 0, role: "Quantum-safe security",   tier: "speculative", maxPositionPct: 0.03 },
  { ticker: "ZENA", name: "ZenaTech",                                 weight: 0.02, expense: 0, role: "AI drones / other",       tier: "speculative", maxPositionPct: 0.03 },
];

// Sanity check at module load (catches future weight drift before runtime).
const STOCK_WEIGHT_SUM = STOCK_TARGETS.reduce((s, t) => s + t.weight, 0);
if (Math.abs(STOCK_WEIGHT_SUM - 1) > 1e-6) {
  // eslint-disable-next-line no-console
  console.warn(`[config/stocks] STOCK_TARGETS weights sum to ${STOCK_WEIGHT_SUM}, expected 1.0`);
}

// Sleeve groupings — keep distinct from ETF sleeves so the labels and caps
// don't bleed across portfolios.
export type StockSleeve =
  | "ai-infra-semi"
  | "ai-infra-power"
  | "ai-software"
  | "ai-cloud"
  | "auto-semi"
  | "quantum"
  | "quantum-security"
  | "speculative-other";

export const STOCK_SLEEVE_LABEL: Record<StockSleeve, string> = {
  "ai-infra-semi":     "AI Infra — Semis",
  "ai-infra-power":    "AI Infra — Power",
  "ai-software":       "AI Software",
  "ai-cloud":          "AI Cloud",
  "auto-semi":         "Auto Semi",
  "quantum":           "Quantum Compute",
  "quantum-security":  "Quantum-Safe Security",
  "speculative-other": "Speculative — Other",
};

export const STOCK_ROLE_TO_SLEEVE: Record<string, StockSleeve> = {
  "AI accelerator":              "ai-infra-semi",
  "AI networking semi":          "ai-infra-semi",
  "Foundry":                     "ai-infra-semi",
  "Litho equipment":             "ai-infra-semi",
  "HBM / memory":                "ai-infra-semi",
  "AI optics":                   "ai-infra-semi",
  "Data center power/cooling":   "ai-infra-power",
  "AI power / fuel cells":       "ai-infra-power",
  "AI data security":            "ai-software",
  "AI cloud / GPU lease":        "ai-cloud",
  "Auto-semi":                   "auto-semi",
  "Quantum compute":             "quantum",
  "Quantum-safe security":       "quantum-security",
  "AI drones / other":           "speculative-other",
};

// Per-sleeve caps (decimal of total portfolio value).
//   hard — buy is blocked if it would push sleeve above this
//   soft — buy is scaled down if it would land above this (optional)
export const STOCK_SLEEVE_CAPS: Record<string, SleeveCap> = {
  "ai-infra-semi":     { hardPct: 0.70, softPct: 0.60 },
  "ai-infra-power":    { hardPct: 0.18, softPct: 0.15 },
  "ai-software":       { hardPct: 0.12 },
  "ai-cloud":          { hardPct: 0.12 },
  "auto-semi":         { hardPct: 0.06 },
  "quantum":           { hardPct: 0.12 },
  "quantum-security":  { hardPct: 0.08 },
  "speculative-other": { hardPct: 0.05 },
};

export const STOCK_TRANCHES: Tranche[] = buildTranches(STOCK_DEFAULT_CAPITAL, STOCK_DEFAULT_CASH_BUFFER);

export const STOCK_PORTFOLIO: PortfolioConfig = {
  capital: STOCK_DEFAULT_CAPITAL,
  cashBuffer: STOCK_DEFAULT_CASH_BUFFER,
  targets: [...STOCK_TARGETS],
  tranches: [...STOCK_TRANCHES],
  holdings: [],
  cash: STOCK_DEFAULT_CAPITAL,
};

export const stocksBundle: PortfolioBundle = {
  kind: "stocks",
  label: "Stock Portfolio",
  defaultCapital: STOCK_DEFAULT_CAPITAL,
  defaultCashBuffer: STOCK_DEFAULT_CASH_BUFFER,
  buildTranches,
  base: STOCK_PORTFOLIO,
  roleToSleeve: STOCK_ROLE_TO_SLEEVE,
  sleeveLabel: STOCK_SLEEVE_LABEL,
  sleeveCaps: STOCK_SLEEVE_CAPS,
  computeEtfOverlap: false,
};
