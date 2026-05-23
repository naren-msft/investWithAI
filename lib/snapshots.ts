import { promises as fs } from "node:fs";
import path from "node:path";
import { dataFile, type PortfolioKind } from "@/config/bundle";
import type { BuyRecommendation, PipelineResult, RegimeKind, Signal } from "@/types";

export interface Snapshot {
  asOf: string;
  regimeKind: RegimeKind;
  regimeMultiplier: number;
  portfolioValue: number;
  deployedUsd: number;
  cashUsd: number;
  dayPnlUsd: number;
  signals: { ticker: string; signal: Signal; rsi: number; macdHist: number }[];
  topRecs: { ticker: string; dollars: number; shares: number; signal: Signal }[];
}

function fileFor(kind: PortfolioKind): string {
  return dataFile(kind, "snapshots.json");
}

const MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_KEEP = 2000;

async function ensureFile(kind: PortfolioKind): Promise<void> {
  const f = fileFor(kind);
  try { await fs.access(f); }
  catch {
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, JSON.stringify({ snapshots: [] }, null, 2), "utf8");
  }
}

export async function readSnapshots(kind: PortfolioKind = "etf"): Promise<Snapshot[]> {
  await ensureFile(kind);
  try {
    const raw = await fs.readFile(fileFor(kind), "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j.snapshots) ? j.snapshots : [];
  } catch { return []; }
}

async function writeSnapshots(kind: PortfolioKind, list: Snapshot[]): Promise<void> {
  await ensureFile(kind);
  await fs.writeFile(fileFor(kind), JSON.stringify({ snapshots: list }, null, 2), "utf8");
}

export function pipelineToSnapshot(p: PipelineResult): Snapshot {
  return {
    asOf: p.asOf,
    regimeKind: p.regime.kind,
    regimeMultiplier: p.regime.multiplier,
    portfolioValue: p.portfolioValue,
    deployedUsd: p.deployedUsd,
    cashUsd: p.cashUsd,
    dayPnlUsd: p.dayPnlUsd,
    signals: p.signals.map((s) => ({ ticker: s.ticker, signal: s.signal, rsi: s.rsi, macdHist: s.macdHist })),
    topRecs: p.recommendations.slice(0, 12).map((r: BuyRecommendation) => ({
      ticker: r.ticker, dollars: r.dollars, shares: r.shares, signal: r.signal,
    })),
  };
}

export async function appendSnapshotIfStale(p: PipelineResult, kind: PortfolioKind = "etf"): Promise<Snapshot | null> {
  try {
    const list = await readSnapshots(kind);
    const last = list[list.length - 1];
    const now = new Date(p.asOf).getTime();
    if (last && now - new Date(last.asOf).getTime() < MIN_INTERVAL_MS) return null;
    const snap = pipelineToSnapshot(p);
    list.push(snap);
    if (list.length > MAX_KEEP) list.splice(0, list.length - MAX_KEEP);
    await writeSnapshots(kind, list);
    return snap;
  } catch { return null; }
}

// Compute the changes between the two most recent snapshots that aren't from
// the same run. Returns `null` if we don't yet have two snapshots.
export interface ChangeSet {
  current: Snapshot;
  previous: Snapshot;
  regimeChanged: boolean;
  signalChanges: { ticker: string; from: Signal; to: Signal }[];
  newRecommendations: { ticker: string; dollars: number; signal: Signal }[];   // appeared since previous snapshot
  droppedRecommendations: { ticker: string }[];                                 // were recommended, no longer
}

export function diffSnapshots(current: Snapshot, previous: Snapshot): ChangeSet {
  const prevSig = new Map(previous.signals.map((s) => [s.ticker, s.signal]));
  const currSig = new Map(current.signals.map((s) => [s.ticker, s.signal]));
  const signalChanges: ChangeSet["signalChanges"] = [];
  for (const [t, sig] of currSig) {
    const prev = prevSig.get(t);
    if (prev && prev !== sig) signalChanges.push({ ticker: t, from: prev, to: sig });
  }
  const prevRecs = new Set(previous.topRecs.map((r) => r.ticker));
  const currRecs = new Set(current.topRecs.map((r) => r.ticker));
  const newRecommendations = current.topRecs
    .filter((r) => !prevRecs.has(r.ticker))
    .map((r) => ({ ticker: r.ticker, dollars: r.dollars, signal: r.signal }));
  const droppedRecommendations = [...prevRecs]
    .filter((t) => !currRecs.has(t))
    .map((t) => ({ ticker: t }));

  return {
    current,
    previous,
    regimeChanged: current.regimeKind !== previous.regimeKind,
    signalChanges,
    newRecommendations,
    droppedRecommendations,
  };
}
