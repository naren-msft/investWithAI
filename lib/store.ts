import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Holding, Tranche } from "@/types";

export interface Execution {
  id: string;
  ticker: string;
  shares: number;
  price: number;
  date: string;          // YYYY-MM-DD
  note?: string;
}

const FILE = path.join(process.cwd(), "data", "executions.json");

async function ensureFile(): Promise<void> {
  try { await fs.access(FILE); }
  catch {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify({ executions: [] }, null, 2), "utf8");
  }
}

export async function readExecutions(): Promise<Execution[]> {
  await ensureFile();
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j.executions) ? j.executions : [];
  } catch { return []; }
}

async function writeExecutions(execs: Execution[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify({ executions: execs }, null, 2), "utf8");
}

export async function appendExecution(e: Omit<Execution, "id">): Promise<Execution> {
  const list = await readExecutions();
  const full: Execution = { id: randomUUID(), ...e };
  list.push(full);
  await writeExecutions(list);
  return full;
}

export async function deleteExecution(id: string): Promise<boolean> {
  const list = await readExecutions();
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return false;
  await writeExecutions(next);
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

// Mark tranches executed/next/pending based on cumulative deployed cash.
export function withTrancheStatus(tranches: readonly Tranche[], deployed: number): Tranche[] {
  let cum = 0;
  let nextAssigned = false;
  return tranches.map((t) => {
    cum += t.size;
    if (deployed >= cum) return { ...t, status: "executed" };
    if (!nextAssigned) { nextAssigned = true; return { ...t, status: "next" }; }
    return { ...t, status: "pending" };
  });
}
