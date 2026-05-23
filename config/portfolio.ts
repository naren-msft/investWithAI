import type { PortfolioConfig } from "@/types";
import type { PortfolioBundle } from "./bundle";

// NOTE: These figures are an EXAMPLE portfolio sizing for the demo.
// Override at runtime via the in-app editor (Hero card) or via the CAPITAL /
// CASH_BUFFER environment variables.
export const DEFAULT_CAPITAL = Number(process.env.CAPITAL ?? 100_000);
export const DEFAULT_CASH_BUFFER = Number(process.env.CASH_BUFFER ?? 20_000);

export const CAPITAL = DEFAULT_CAPITAL;
export const CASH_BUFFER = DEFAULT_CASH_BUFFER; // reserved (never deployed)
export const DEPLOYABLE = CAPITAL - CASH_BUFFER;

// LEAN 8-ETF portfolio (researched 2026-05-22, redesigned to reduce mega-cap
// overlap while preserving theme tilts that have historically beaten SPY).
//
//   Dropped from prior 11-ETF mix:
//     - FDVV : ~14% of its weight was NVDA+AAPL+MSFT, pure overlap with FELC/QQQM.
//             Income role now covered by FBND's 4.7% monthly yield.
//     - FMDE : mid-cap exposure already comes through FELC's broader holdings.
//     - XBI  : 5Y return of −0.7% shows the tail risk; biotech is already
//             ~16% of FHLC's sub-industry mix.
//
// Resulting design:
//   28% FELC — US large-cap core (enhanced active overlay vs SPY)
//   18% QQQM — AI / mega-cap growth (Nasdaq-100 has beaten SPY long-term)
//    8% SMH  — concentrated semis (high beta alpha source)
//   15% FENI — international (true diversifier, beta 0.58, P/E 15)
//   10% FHLC — healthcare (defensive + biotech sub-exposure)
//    8% XAR  — aerospace & defense (equal-weight, mid-cap A&D tilt)
//    6% FENY — energy (inflation hedge, 2.4% yield)
//    7% FBND — bond ballast (4.7% monthly income, low correlation)
//
// Blended ER ≈ 0.21%/yr. Designed to outperform SPY via growth tilt + sector
// themes while keeping a 22% defensive sleeve (FENI/FHLC/FBND).
export const TARGETS = [
  { ticker: "FELC", name: "Fidelity Enhanced Large Cap Core",  weight: 0.28, expense: 0.0018,  role: "US large-cap core" },
  { ticker: "QQQM", name: "Invesco Nasdaq 100",                 weight: 0.18, expense: 0.0015,  role: "AI / mega-cap tech" },
  { ticker: "FENI", name: "Fidelity Enhanced International",    weight: 0.15, expense: 0.0028,  role: "International developed" },
  { ticker: "FHLC", name: "Fidelity MSCI Health Care",          weight: 0.10, expense: 0.00084, role: "Healthcare" },
  { ticker: "SMH",  name: "VanEck Semiconductor ETF",           weight: 0.08, expense: 0.0035,  role: "Semiconductors (AI infra)" },
  { ticker: "XAR",  name: "SPDR S&P Aerospace & Defense",       weight: 0.08, expense: 0.0035,  role: "Aerospace & defense" },
  { ticker: "FBND", name: "Fidelity Total Bond ETF",            weight: 0.07, expense: 0.0036,  role: "Bond ballast / income" },
  { ticker: "FENY", name: "Fidelity MSCI Energy",               weight: 0.06, expense: 0.00084, role: "Energy / inflation hedge" },
] as const;

// Tranche schedule as fractions of the deployable capital + buffer release.
// Phase 1–4 split the deployable sleeve 50/16.67/16.67/16.66; Phase 5 is the
// cash-buffer release. Using fractions lets the schedule auto-scale to any
// configured CAPITAL / CASH_BUFFER.
const TRANCHE_FRACTIONS_OF_DEPLOYABLE = [0.50, 1 / 6, 1 / 6, 1 / 6] as const;

export function buildTranches(capital: number, cashBuffer: number) {
  const deployable = Math.max(0, capital - cashBuffer);
  const p1 = Math.round(deployable * TRANCHE_FRACTIONS_OF_DEPLOYABLE[0]);
  const p2 = Math.round(deployable * TRANCHE_FRACTIONS_OF_DEPLOYABLE[1]);
  const p3 = Math.round(deployable * TRANCHE_FRACTIONS_OF_DEPLOYABLE[2]);
  // P4 absorbs the rounding remainder so P1..P4 = deployable exactly.
  const p4 = Math.max(0, deployable - (p1 + p2 + p3));
  return [
    {
      phase: 1,
      size: p1,
      gate: "Start immediately.",
      triggers: { daysFromStart: 0 },
      status: "ready" as const,
    },
    {
      phase: 2,
      size: p2,
      gate: "SPY −5% from P1 peak OR 30 days elapsed.",
      triggers: { daysFromStart: 30, spyDrawdownPct: 0.05 },
      status: "locked" as const,
    },
    {
      phase: 3,
      size: p3,
      gate: "SPY −8% from P1 peak OR 60 days elapsed.",
      triggers: { daysFromStart: 60, spyDrawdownPct: 0.08 },
      status: "locked" as const,
    },
    {
      phase: 4,
      size: p4,
      gate: "SPY −12% correction from P1 peak (no time fallback).",
      triggers: { spyDrawdownPct: 0.12 },
      status: "locked" as const,
    },
    {
      phase: 5,
      size: cashBuffer,
      gate: "Trend confirmation (≥5% pullback then back to rally) OR 90 days elapsed. Represents the cash-buffer release.",
      triggers: { daysFromStart: 90, trendConfirmation: true },
      status: "locked" as const,
    },
  ];
}

export const TRANCHES = buildTranches(CAPITAL, CASH_BUFFER);

export const PORTFOLIO: PortfolioConfig = {
  capital: CAPITAL,
  cashBuffer: CASH_BUFFER,
  targets: [...TARGETS],
  tranches: [...TRANCHES],
  holdings: [],
  cash: CAPITAL,
};

// Sleeve grouping used by the Exposure panel and (future) sector-cap rules.
export type SleeveGroup =
  | "equity-growth"
  | "equity-defensive"
  | "international"
  | "fixed-income"
  | "alternatives";

export const SLEEVE_LABEL: Record<SleeveGroup, string> = {
  "equity-growth": "Equity Growth",
  "equity-defensive": "Equity Defensive",
  "international": "International",
  "fixed-income": "Fixed Income",
  "alternatives": "Alternatives",
};

// Each role string from TARGETS maps to exactly one sleeve.
export const ROLE_TO_SLEEVE: Record<string, SleeveGroup> = {
  "US large-cap core":            "equity-growth",
  "AI / mega-cap tech":           "equity-growth",
  "Semiconductors (AI infra)":    "equity-growth",
  "Aerospace & defense":          "equity-growth",
  "Healthcare":                   "equity-defensive",
  "International developed":      "international",
  "Bond ballast / income":        "fixed-income",
  "Energy / inflation hedge":     "alternatives",
};

export function sleeveFor(role: string): SleeveGroup {
  return ROLE_TO_SLEEVE[role] ?? "alternatives";
}

export const FIDELITY_TRADE_URL = (symbol: string) =>
  `https://digital.fidelity.com/ftgw/digital/trade-equity?ACCOUNT=&SYMBOL=${encodeURIComponent(symbol)}`;

export const FIDELITY_QUOTE_URL = (symbol: string) =>
  `https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=${encodeURIComponent(symbol)}`;

export const ROBINHOOD_TRADE_URL = (symbol: string) =>
  `https://robinhood.com/stocks/${encodeURIComponent(symbol)}`;

export const SCHWAB_TRADE_URL = (symbol: string) =>
  `https://client.schwab.com/app/trade/tom/#/trade?symbol=${encodeURIComponent(symbol)}`;

// ETF portfolio bundle — wraps the constants above into the generic shape
// consumed by runPipeline() so the same pipeline serves both ETF and Stocks.
export const etfBundle: PortfolioBundle = {
  kind: "etf",
  label: "ETF Portfolio",
  defaultCapital: DEFAULT_CAPITAL,
  defaultCashBuffer: DEFAULT_CASH_BUFFER,
  buildTranches,
  base: PORTFOLIO,
  roleToSleeve: ROLE_TO_SLEEVE,
  sleeveLabel: SLEEVE_LABEL,
  computeEtfOverlap: true,
};
