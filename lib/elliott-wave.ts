// Elliott Wave signal layer — hand-maintained MVP.
//
// Single source of truth: data/stocks/elliott-wave.json
// Update weekly as you read EWF posts. The pipeline does NOT use this signal
// to size positions yet; it's surfaced as an Invalidation Watch card only.
//
// Phase → conviction multiplier mapping is intentionally NOT exported here;
// adding it later is a deliberate, audited change (see EW research report).

import fs from "node:fs";
import path from "node:path";

export type EwPhase =
  | "W1"
  | "W2"
  | "W3"
  | "W3-of-3"
  | "W4"
  | "W5"
  | "A"
  | "B"
  | "C"
  | "UNKNOWN";

export interface EwCount {
  phase: EwPhase;
  invalidationPrice: number | null;
  primaryTarget: number | null;
  confidence: number;
  degree: string | null;
  source: string | null;
  lastUpdated: string | null;
  note: string | null;
}

export interface EwDataFile {
  asOf: string;
  counts: Record<string, EwCount>;
}

let cached: { mtimeMs: number; data: EwDataFile } | null = null;

function dataPath(): string {
  return path.join(process.cwd(), "config", "elliott-wave.json");
}

export function loadEwData(): EwDataFile {
  const p = dataPath();
  const stat = fs.statSync(p);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
  const raw = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(raw) as EwDataFile;
  cached = { mtimeMs: stat.mtimeMs, data: parsed };
  return parsed;
}

export function getEwCount(ticker: string): EwCount | null {
  try {
    const data = loadEwData();
    return data.counts[ticker] ?? null;
  } catch {
    return null;
  }
}

export interface InvalidationStatus {
  ticker: string;
  phase: EwPhase;
  price: number;
  invalidationPrice: number | null;
  primaryTarget: number | null;
  distancePct: number | null;     // (price - invalidation) / price; signed, can be negative if broken
  isBreached: boolean;
  isNearBreach: boolean;          // |distancePct| <= NEAR_BREACH_THRESHOLD
  confidence: number;
  source: string | null;
  lastUpdated: string | null;
  note: string | null;
}

const NEAR_BREACH_THRESHOLD = 0.03; // 3%

// For an established bullish count, invalidation is BELOW price; broken if
// price < invalidationPrice. For a bearish count (A/B/C tops), invalidation
// is ABOVE price. We approximate "isBreached" using phase semantics.
function isBullishPhase(phase: EwPhase): boolean {
  return phase === "W1" || phase === "W2" || phase === "W3" || phase === "W3-of-3" || phase === "W4" || phase === "W5";
}

export function computeInvalidationStatus(
  ticker: string,
  price: number,
  count: EwCount | null,
): InvalidationStatus {
  if (!count) {
    return {
      ticker,
      phase: "UNKNOWN",
      price,
      invalidationPrice: null,
      primaryTarget: null,
      distancePct: null,
      isBreached: false,
      isNearBreach: false,
      confidence: 0,
      source: null,
      lastUpdated: null,
      note: null,
    };
  }
  let distancePct: number | null = null;
  let isBreached = false;
  if (count.invalidationPrice != null && price > 0) {
    distancePct = (price - count.invalidationPrice) / price;
    if (isBullishPhase(count.phase)) {
      isBreached = price < count.invalidationPrice;
    } else {
      isBreached = price > count.invalidationPrice;
    }
  }
  const isNearBreach =
    distancePct != null && !isBreached && Math.abs(distancePct) <= NEAR_BREACH_THRESHOLD;
  return {
    ticker,
    phase: count.phase,
    price,
    invalidationPrice: count.invalidationPrice,
    primaryTarget: count.primaryTarget,
    distancePct,
    isBreached,
    isNearBreach,
    confidence: count.confidence,
    source: count.source,
    lastUpdated: count.lastUpdated,
    note: count.note,
  };
}

export interface InvalidationReport {
  asOf: string;
  dataAsOf: string;
  rows: InvalidationStatus[];
  coverage: {
    total: number;
    counted: number;       // phase !== UNKNOWN
    breached: number;
    nearBreach: number;
    autoCount: number;     // # of rows whose count came from the auto-counter
    manualCount: number;   // # of rows whose count came from the JSON file
  };
}

export function buildInvalidationReport(
  priceByTicker: Record<string, number>,
  autoCounts?: Record<string, EwCount | null>,
  tickerTier?: Record<string, "core" | "growth" | "speculative" | undefined>,
): InvalidationReport {
  let data: EwDataFile;
  try {
    data = loadEwData();
  } catch {
    return {
      asOf: new Date().toISOString(),
      dataAsOf: "unknown",
      rows: [],
      coverage: { total: 0, counted: 0, breached: 0, nearBreach: 0, autoCount: 0, manualCount: 0 },
    };
  }
  const rows: InvalidationStatus[] = [];
  let autoUsed = 0;
  let manualUsed = 0;
  for (const [ticker, manualCount] of Object.entries(data.counts)) {
    const price = priceByTicker[ticker] ?? 0;
    let effective: EwCount | null = manualCount;
    const manualIsKnown = manualCount && manualCount.phase !== "UNKNOWN";
    if (!manualIsKnown && autoCounts && autoCounts[ticker]) {
      effective = autoCounts[ticker];
      if (effective && effective.phase !== "UNKNOWN") autoUsed += 1;
    } else if (manualIsKnown) {
      manualUsed += 1;
    }
    rows.push(computeInvalidationStatus(ticker, price, effective));
    void tickerTier; // reserved for future weighting
  }
  const counted = rows.filter((r) => r.phase !== "UNKNOWN").length;
  const breached = rows.filter((r) => r.isBreached).length;
  const nearBreach = rows.filter((r) => r.isNearBreach).length;
  return {
    asOf: new Date().toISOString(),
    dataAsOf: data.asOf,
    rows,
    coverage: { total: rows.length, counted, breached, nearBreach, autoCount: autoUsed, manualCount: manualUsed },
  };
}
