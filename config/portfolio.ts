import type { PortfolioConfig } from "@/types";

export const CAPITAL = 300_000;
export const CASH_BUFFER = 60_000;        // reserved (never deployed)
export const DEPLOYABLE = CAPITAL - CASH_BUFFER; // 240_000

// Balanced-tilt portfolio — Fidelity-issued ETFs preferred where reasonable
// equivalents exist (user preference). Blended expense ≈ 0.21%/yr.
// Themes: AI mega-cap, semis, healthcare, defense, energy, biotech, dividend
// defense, bonds, international.
export const TARGETS = [
  { ticker: "FELC", name: "Fidelity Enhanced Large Cap Core",   weight: 0.18, expense: 0.0018,  role: "US large-cap core" },
  { ticker: "QQQM", name: "Invesco Nasdaq 100",                 weight: 0.14, expense: 0.0015,  role: "AI / mega-cap tech" },
  { ticker: "FENI", name: "Fidelity Enhanced International",    weight: 0.12, expense: 0.0028,  role: "International developed" },
  { ticker: "SMH",  name: "VanEck Semiconductor ETF",            weight: 0.10, expense: 0.0035,  role: "Semiconductors (AI infra)" },
  { ticker: "FDVV", name: "Fidelity High Dividend ETF",          weight: 0.10, expense: 0.0016,  role: "Quality dividend / defensive" },
  { ticker: "FHLC", name: "Fidelity MSCI Health Care",           weight: 0.08, expense: 0.00084, role: "Healthcare" },
  { ticker: "FMDE", name: "Fidelity Enhanced Mid Cap",           weight: 0.08, expense: 0.0023,  role: "Mid-cap growth" },
  { ticker: "XAR",  name: "SPDR S&P Aerospace & Defense",        weight: 0.06, expense: 0.0035,  role: "Aerospace & defense" },
  { ticker: "FENY", name: "Fidelity MSCI Energy",                weight: 0.06, expense: 0.00084, role: "Energy / inflation hedge" },
  { ticker: "XBI",  name: "SPDR S&P Biotech",                    weight: 0.04, expense: 0.0035,  role: "Biotech upside kicker" },
  { ticker: "FBND", name: "Fidelity Total Bond ETF",             weight: 0.04, expense: 0.0036,  role: "Bond ballast" },
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
