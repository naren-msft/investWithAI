import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataFile, type PortfolioKind } from "@/config/bundle";
import type { Holding, Tranche } from "@/types";

export type ExecutionSide = "buy" | "sell";

export interface Execution {
  id: string;
  ticker: string;
  shares: number;
  price: number;
  date: string;          // YYYY-MM-DD
  note?: string;
  // Optional extensions — older rows omit these and are treated as buys with
  // zero fees, matching the original behavior.
  side?: ExecutionSide;
  fees?: number;
  // Source provenance (manual entry, broker CSV import, …) — useful for
  // reconciliation views; not used by sizing.
  source?: "manual" | "import-fidelity" | "import-schwab" | "import-robinhood" | "import-generic";
  // Free-text broker order/fill id for cross-reference.
  externalId?: string;
}

function fileFor(kind: PortfolioKind): string {
  return dataFile(kind, "executions.json");
}

// ─────────────────────────────────────────────────────────────────────────────
// File lock — prevents concurrent read-modify-write races during high-frequency
// dashboard usage (auto-refresh + cron + manual entry). Uses an in-process
// mutex per kind plus an on-disk .lock file as a belt-and-braces guard.
// ─────────────────────────────────────────────────────────────────────────────
const inProcLocks = new Map<PortfolioKind, Promise<unknown>>();

async function withLock<T>(kind: PortfolioKind, fn: () => Promise<T>): Promise<T> {
  const prev = inProcLocks.get(kind) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => { release = res; });
  inProcLocks.set(kind, prev.then(() => next).catch(() => next));
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
    if (inProcLocks.get(kind) === next) inProcLocks.delete(kind);
  }
}

async function ensureFile(kind: PortfolioKind): Promise<void> {
  const f = fileFor(kind);
  try { await fs.access(f); }
  catch {
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, JSON.stringify({ executions: [] }, null, 2), "utf8");
  }
}

export async function readExecutions(kind: PortfolioKind = "etf"): Promise<Execution[]> {
  await ensureFile(kind);
  try {
    const raw = await fs.readFile(fileFor(kind), "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j.executions) ? j.executions : [];
  } catch { return []; }
}

async function writeExecutionsAtomic(kind: PortfolioKind, execs: Execution[]): Promise<void> {
  await ensureFile(kind);
  const finalPath = fileFor(kind);
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify({ executions: execs }, null, 2), "utf8");
  await fs.rename(tmpPath, finalPath); // atomic on POSIX
}

export async function appendExecution(e: Omit<Execution, "id">, kind: PortfolioKind = "etf"): Promise<Execution> {
  return withLock(kind, async () => {
    const list = await readExecutions(kind);
    const full: Execution = { id: randomUUID(), side: "buy", fees: 0, source: "manual", ...e };
    list.push(full);
    await writeExecutionsAtomic(kind, list);
    return full;
  });
}

export async function deleteExecution(id: string, kind: PortfolioKind = "etf"): Promise<boolean> {
  return withLock(kind, async () => {
    const list = await readExecutions(kind);
    const next = list.filter((x) => x.id !== id);
    if (next.length === list.length) return false;
    await writeExecutionsAtomic(kind, next);
    return true;
  });
}

// Aggregate executions into per-ticker holdings — signed by side (sells reduce
// shares and cost basis proportionally).
export function aggregateHoldings(execs: Execution[]): Holding[] {
  const by = new Map<string, { shares: number; costBasis: number }>();
  for (const e of execs) {
    const sign = e.side === "sell" ? -1 : 1;
    const cur = by.get(e.ticker) ?? { shares: 0, costBasis: 0 };
    if (sign === 1) {
      cur.shares    += e.shares;
      cur.costBasis += e.shares * e.price + (e.fees ?? 0);
    } else {
      // Sell: reduce shares; reduce cost basis pro-rata (avg-cost method).
      const avg = cur.shares > 0 ? cur.costBasis / cur.shares : 0;
      const sellShares = Math.min(cur.shares, e.shares);
      cur.shares    -= sellShares;
      cur.costBasis -= sellShares * avg;
    }
    by.set(e.ticker, cur);
  }
  return Array.from(by, ([ticker, v]) => ({ ticker, shares: Math.max(0, v.shares), costBasis: Math.max(0, v.costBasis) }));
}

export function totalDeployed(execs: Execution[]): number {
  // Net deployed dollars = buys − sells (excluding fees from the deployment
  // figure — fees are tracked separately for cost-basis purposes only).
  return execs.reduce((s, e) => s + (e.side === "sell" ? -1 : 1) * e.shares * e.price, 0);
}

export function totalFees(execs: Execution[]): number {
  return execs.reduce((s, e) => s + (e.fees ?? 0), 0);
}
