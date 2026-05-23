import path from "node:path";
import type { PortfolioConfig, TargetWeight, Tranche } from "@/types";

/**
 * A PortfolioKind identifies an independent portfolio sleeve with its own
 * config, executions, snapshots and regime-hysteresis state. "etf" is the
 * original portfolio (files at data/*.json — kept for backward compatibility);
 * "stocks" is the new individual-stock sleeve (files under data/stocks/*.json).
 */
export type PortfolioKind = "etf" | "stocks";

/**
 * Resolve the on-disk directory for a portfolio's persisted data. The ETF
 * sleeve continues to use the repo-root `data/` directory so existing files
 * (executions.json, snapshots.json, regime-state.json) are not migrated.
 * Stocks-sleeve files live under `data/stocks/`.
 */
export function dataDir(kind: PortfolioKind): string {
  return kind === "etf"
    ? path.join(process.cwd(), "data")
    : path.join(process.cwd(), "data", "stocks");
}

export function dataFile(kind: PortfolioKind, file: string): string {
  return path.join(dataDir(kind), file);
}

/**
 * Per-portfolio sleeve cap configuration. Caps are expressed as a decimal
 * fraction of total portfolio value (target dollars). A buy that would push
 * the sleeve over `hardPct` is blocked entirely (skip-code "sleeve-cap"); a
 * buy that would land between `softPct` and `hardPct` is scaled down so the
 * sleeve lands exactly at `hardPct`.
 */
export interface SleeveCap {
  hardPct: number;
  softPct?: number;
}

export interface PortfolioBundle {
  kind: PortfolioKind;
  label: string;                                           // human-readable name for UI ("ETF Portfolio")
  defaultCapital: number;
  defaultCashBuffer: number;
  buildTranches: (capital: number, cashBuffer: number) => Tranche[];
  base: PortfolioConfig;                                   // defaults; runPipeline applies overrides
  roleToSleeve: Record<string, string>;
  sleeveLabel: Record<string, string>;
  sleeveCaps?: Record<string, SleeveCap>;                  // per-sleeve cap (stocks only)
  // Whether to compute ETF-style top-holdings overlap. False for stocks (sector
  // exposure is derived from per-stock sector classification instead).
  computeEtfOverlap: boolean;
}
