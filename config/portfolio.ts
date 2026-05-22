import type { PortfolioConfig } from "@/types";

export const CAPITAL = 300_000;
export const CASH_BUFFER = 60_000;        // reserved (never deployed)
export const DEPLOYABLE = CAPITAL - CASH_BUFFER; // 240_000

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

// Staged deployment: $140K initial + 3 phased tranches of ~$33K of the $240K deployable
const INITIAL = 140_000;
const REMAINING = DEPLOYABLE - INITIAL;
const phaseSize = Math.round(REMAINING / 3);

export const TRANCHES = [
  { phase: 1, size: INITIAL,                                gate: "Deploy on day 1 (initial tranche).",                              status: "next"    as const },
  { phase: 2, size: phaseSize,                              gate: "After 30 days OR SPY pullback ≥ 5%.",                              status: "pending" as const },
  { phase: 3, size: phaseSize,                              gate: "After 60 days OR SPY pullback ≥ 8%.",                              status: "pending" as const },
  { phase: 4, size: REMAINING - phaseSize * 2,              gate: "After 90 days OR confirmed rally / correction buy.",              status: "pending" as const },
];

export const PORTFOLIO: PortfolioConfig = {
  capital: CAPITAL,
  cashBuffer: CASH_BUFFER,
  targets: [...TARGETS],
  tranches: [...TRANCHES],
  holdings: [],
  cash: CAPITAL,
};

export const FIDELITY_TRADE_URL = (symbol: string) =>
  `https://digital.fidelity.com/ftgw/digital/trade-equity?ACCOUNT=&SYMBOL=${encodeURIComponent(symbol)}`;

export const FIDELITY_QUOTE_URL = (symbol: string) =>
  `https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=${encodeURIComponent(symbol)}`;
