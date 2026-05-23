import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataFile, type PortfolioKind } from "@/config/bundle";
import type { Holding, Tranche } from "@/types";

export interface Execution {
  id: string;
  ticker: string;
  shares: number;
  price: number;
  date: string;          // YYYY-MM-DD
  note?: string;
}

function fileFor(kind: PortfolioKind): string {
  return dataFile(kind, "executions.json");
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

async function writeExecutions(kind: PortfolioKind, execs: Execution[]): Promise<void> {
  await ensureFile(kind);
  await fs.writeFile(fileFor(kind), JSON.stringify({ executions: execs }, null, 2), "utf8");
}

export async function appendExecution(e: Omit<Execution, "id">, kind: PortfolioKind = "etf"): Promise<Execution> {
  const list = await readExecutions(kind);
  const full: Execution = { id: randomUUID(), ...e };
  list.push(full);
  await writeExecutions(kind, list);
  return full;
}

export async function deleteExecution(id: string, kind: PortfolioKind = "etf"): Promise<boolean> {
  const list = await readExecutions(kind);
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return false;
  await writeExecutions(kind, next);
  return true;
}

// Aggregate executions into per-ticker holdings.
export function aggregateHoldings(execs: Execution[]): Holding[] {
  const by = new Map<string, { shares: number; costBasis: number }>();
  for (const e of execs) {
    const cur = by.get(e.ticker) ?? { shares: 0, costBasis: 0 };
    cur.shares    += e.shares;
    cur.costBasis += e.shares * e.price;
    by.set(e.ticker, cur);
  }
  return Array.from(by, ([ticker, v]) => ({ ticker, shares: v.shares, costBasis: v.costBasis }));
}

export function totalDeployed(execs: Execution[]): number {
  return execs.reduce((s, e) => s + e.shares * e.price, 0);
}
