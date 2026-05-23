// Automated Elliott Wave count via ZigZag pivots + Fibonacci ratio scoring.
//
// This is a deterministic heuristic, NOT an EW expert system. It does:
//   1. Find swing pivots via ZigZag (% retracement threshold)
//   2. Take the most recent 6 pivots, hypothesize a 5-wave bullish impulse
//      (W0 start, W1, W2, W3, W4, W5) and validate the 3 cardinal rules
//   3. Score the count by Fibonacci proximity (W2 retrace, W3 extension,
//      W4 retrace, W5 equality)
//   4. From the highest-scoring valid count, infer current phase from where
//      `lastPrice` sits relative to W5 and the post-W5 swing
//   5. Compute invalidation price (the count-breaker) and primary target
//
// Limits:
//   - Bullish impulses only (matches the long-biased AI/quantum portfolio)
//   - Diagonals, truncations, and ABC corrections are detected via fallback
//     ("price below W5, last leg down" → label A/B/C, invalidation = W5)
//   - When no clean count fits, returns null → caller falls back to UNKNOWN

import type { Candle } from "@/types";
import type { EwCount, EwPhase } from "../elliott-wave";

export interface Pivot {
  idx: number;
  date: string;
  price: number;
  kind: "H" | "L";
}

/**
 * Closing-price ZigZag. Walks the series, tracks running extreme, emits a
 * pivot when price retraces from the extreme by at least `thresholdPct`.
 */
export function findZigZagPivots(candles: Candle[], thresholdPct: number): Pivot[] {
  if (candles.length < 3) return [];
  const pivots: Pivot[] = [];
  let dir: "up" | "down" | null = null;
  let extIdx = 0;
  let extPrice = candles[0].close;

  for (let i = 1; i < candles.length; i++) {
    const p = candles[i].close;
    if (dir === null) {
      const change = (p - candles[0].close) / candles[0].close;
      if (Math.abs(change) >= thresholdPct) {
        dir = change > 0 ? "up" : "down";
        pivots.push({ idx: 0, date: candles[0].date, price: candles[0].close, kind: dir === "up" ? "L" : "H" });
        extIdx = i;
        extPrice = p;
      } else if (p > extPrice) {
        extPrice = p;
        extIdx = i;
      } else if (p < extPrice) {
        extPrice = p;
        extIdx = i;
      }
      continue;
    }
    if (dir === "up") {
      if (p > extPrice) {
        extPrice = p;
        extIdx = i;
      } else if ((extPrice - p) / extPrice >= thresholdPct) {
        pivots.push({ idx: extIdx, date: candles[extIdx].date, price: extPrice, kind: "H" });
        dir = "down";
        extPrice = p;
        extIdx = i;
      }
    } else {
      if (p < extPrice) {
        extPrice = p;
        extIdx = i;
      } else if ((p - extPrice) / extPrice >= thresholdPct) {
        pivots.push({ idx: extIdx, date: candles[extIdx].date, price: extPrice, kind: "L" });
        dir = "up";
        extPrice = p;
        extIdx = i;
      }
    }
  }
  // Append the latest extreme as a tentative pivot so the impulse detector
  // can consider in-progress legs.
  if (dir !== null) {
    const last = pivots[pivots.length - 1];
    if (!last || last.idx !== extIdx) {
      pivots.push({ idx: extIdx, date: candles[extIdx].date, price: extPrice, kind: dir === "up" ? "H" : "L" });
    }
  }
  return pivots;
}

export interface BullishImpulse {
  w0: Pivot;
  w1: Pivot;
  w2: Pivot;
  w3: Pivot;
  w4: Pivot;
  w5: Pivot;
  score: number;
  details: {
    w2Retrace: number;
    w3Extension: number;
    w4Retrace: number;
    w5Ratio: number;
    w3IsLongest: boolean;
  };
}

/**
 * Try to fit a bullish 5-wave impulse to the LAST 6 pivots:
 *   W0 (L) → W1 (H) → W2 (L) → W3 (H) → W4 (L) → W5 (H)
 * Validates the 3 cardinal EW rules and scores by Fibonacci proximity.
 */
export function detectBullishImpulse(pivots: Pivot[]): BullishImpulse | null {
  if (pivots.length < 6) return null;

  // Try the last 6, then the last 7-from-end-1 (skip in-progress tail).
  const candidates: Pivot[][] = [];
  if (pivots.length >= 6) candidates.push(pivots.slice(-6));
  if (pivots.length >= 7) candidates.push(pivots.slice(-7, -1));

  let best: BullishImpulse | null = null;
  for (const seq of candidates) {
    const [w0, w1, w2, w3, w4, w5] = seq;
    // Shape check
    if (w0.kind !== "L" || w1.kind !== "H" || w2.kind !== "L" || w3.kind !== "H" || w4.kind !== "L" || w5.kind !== "H") {
      continue;
    }
    // Rule 1: W2 doesn't retrace ≥ 100% of W1
    if (w2.price <= w0.price) continue;
    // Rule 3: W4 doesn't overlap W1's territory (price must stay above W1 top)
    if (w4.price <= w1.price) continue;
    // Rule 2: W3 isn't the shortest among motive waves
    const w1Len = w1.price - w0.price;
    const w3Len = w3.price - w2.price;
    const w5Len = w5.price - w4.price;
    if (w1Len <= 0 || w3Len <= 0 || w5Len <= 0) continue;
    const w3IsLongest = w3Len >= w1Len && w3Len >= w5Len;
    if (!w3IsLongest && w3Len < Math.min(w1Len, w5Len)) continue;

    // Fibonacci scoring
    const w2Retrace = (w1.price - w2.price) / w1Len;          // 0.382–0.618 ideal
    const w3Extension = w3Len / w1Len;                          // ≥ 1.0, ideal 1.618
    const w4Retrace = (w3.price - w4.price) / w3Len;            // 0.236–0.382 ideal
    const w5Ratio = w5Len / w1Len;                              // ≈ 1.0 (equality) ideal

    const fitW2 = bellScore(w2Retrace, 0.5, 0.2);              // peak at 0.5
    const fitW3 = bellScore(Math.min(w3Extension, 3), 1.618, 0.6);
    const fitW4 = bellScore(w4Retrace, 0.318, 0.18);
    const fitW5 = bellScore(w5Ratio, 1.0, 0.5);
    const fitRule = w3IsLongest ? 1.0 : 0.7;
    // Weighted composite (matches ta4j 0.22.0 weights from research)
    const score =
      0.35 * (fitW2 + fitW3 + fitW4 + fitW5) / 4 +
      0.15 * fitRule +
      0.50 * (Math.min(1, fitW2) * Math.min(1, fitW3));

    const cand: BullishImpulse = {
      w0, w1, w2, w3, w4, w5,
      score,
      details: { w2Retrace, w3Extension, w4Retrace, w5Ratio, w3IsLongest },
    };
    if (!best || score > best.score) best = cand;
  }
  return best;
}

function bellScore(actual: number, target: number, sigma: number): number {
  const z = (actual - target) / sigma;
  return Math.exp(-0.5 * z * z);
}

export interface AutoCountResult extends EwCount {
  pivotsUsed?: number;
  impulseScore?: number;
}

/**
 * Build an EwCount from algorithmic analysis. Returns a count with
 * phase=UNKNOWN if no reasonable structure can be identified.
 */
export function computeAutomatedCount(
  candles: Candle[],
  tier: "core" | "growth" | "speculative" | undefined,
  lastPrice: number,
): AutoCountResult {
  const empty: AutoCountResult = {
    phase: "UNKNOWN",
    invalidationPrice: null,
    primaryTarget: null,
    confidence: 0,
    degree: null,
    source: "auto-zigzag-v1",
    lastUpdated: new Date().toISOString().slice(0, 10),
    note: null,
  };
  if (candles.length < 40 || lastPrice <= 0) return empty;

  const threshold = tier === "speculative" ? 0.12 : tier === "growth" ? 0.09 : 0.07;
  const pivots = findZigZagPivots(candles, threshold);
  if (pivots.length < 4) {
    return { ...empty, note: "Insufficient swing structure", pivotsUsed: pivots.length };
  }

  // Try to fit a 5-wave bullish impulse on the most recent pivots.
  const impulse = detectBullishImpulse(pivots);

  if (impulse) {
    return classifyPostImpulse(impulse, lastPrice, pivots.length);
  }

  // Fallback: classify based on last 3-4 pivots (a partial impulse or a
  // correction in progress).
  return classifyPartial(pivots, lastPrice);
}

function classifyPostImpulse(imp: BullishImpulse, lastPrice: number, nPivots: number): AutoCountResult {
  const { w0, w1, w2, w3, w4, w5, score } = imp;
  const w1Len = w1.price - w0.price;
  const w3Len = w3.price - w2.price;

  // Where is price now relative to the completed 5-wave structure?
  // Case A: price still above W4 and below W5 → we may be IN W5 still, or
  // entering A. Use 0.618 W5 height as cutoff.
  // Case B: price above W5 → either count is wrong (W5 not yet topped, treat
  // as still in W5) or extension. Lean "still W5" to keep invalidation usable.
  // Case C: price below W4 low → A/B/C correction confirmed. Invalidation =
  // W5 high (above = correction was W4 of higher degree, count moot).

  let phase: EwPhase;
  let invalidationPrice: number;
  let primaryTarget: number | null;
  let note: string | null = null;

  if (lastPrice > w5.price * 0.98) {
    // Treat as still in/near W5 top
    phase = "W5";
    invalidationPrice = w4.price;
    primaryTarget = w4.price + w1Len; // equality target
    note = "Price at/above last labeled W5";
  } else if (lastPrice > w4.price) {
    // Between W4 low and W5 high — likely in A of correction OR pulling back
    // before a new high. Conservative: label A.
    phase = "A";
    invalidationPrice = w5.price;
    primaryTarget = w5.price - 0.382 * (w5.price - w0.price);
    note = "Pulling back from W5 high";
  } else if (lastPrice > w2.price) {
    // Below W4 low but above W2 — deep A or in C
    phase = "C";
    invalidationPrice = w5.price;
    primaryTarget = w5.price - 0.618 * (w5.price - w0.price);
    note = "Deep correction from W5";
  } else {
    // Below W2 — prior count likely broken
    phase = "UNKNOWN";
    invalidationPrice = w0.price;
    primaryTarget = null;
    note = "Prior impulse count broken (price below W2)";
  }

  // Sanity: the EW rule for invalidation is asymmetric. Bullish phases break
  // DOWN through invalidation; bearish A/B/C break UP through W5.
  // Discard wildly stale counts where invalidation is more than 60% away.
  if (Math.abs(lastPrice - invalidationPrice) / lastPrice > 0.6) {
    return {
      phase: "UNKNOWN",
      invalidationPrice: null,
      primaryTarget: null,
      confidence: 0,
      degree: null,
      source: "auto-zigzag-v1",
      lastUpdated: new Date().toISOString().slice(0, 10),
      note: "Last impulse too distant to be actionable",
      pivotsUsed: nPivots,
      impulseScore: score,
    };
  }

  // Confidence: cap the bell-product score; bonus when w3 was the longest.
  const confidence = Math.max(0, Math.min(1, score * (imp.details.w3IsLongest ? 1.0 : 0.8)));

  return {
    phase,
    invalidationPrice: Number(invalidationPrice.toFixed(2)),
    primaryTarget: primaryTarget != null ? Number(primaryTarget.toFixed(2)) : null,
    confidence: Number(confidence.toFixed(2)),
    degree: "Auto (daily)",
    source: "auto-zigzag-v1",
    lastUpdated: new Date().toISOString().slice(0, 10),
    note,
    pivotsUsed: nPivots,
    impulseScore: Number(score.toFixed(3)),
  };
}

function classifyPartial(pivots: Pivot[], lastPrice: number): AutoCountResult {
  // No clean 5-wave count, but we can still infer "where the last swing
  // breaks". Use the most recent pivot of the opposite kind as invalidation.
  const lastTwo = pivots.slice(-4);
  if (lastTwo.length < 3) {
    return {
      phase: "UNKNOWN",
      invalidationPrice: null,
      primaryTarget: null,
      confidence: 0,
      degree: null,
      source: "auto-zigzag-v1",
      lastUpdated: new Date().toISOString().slice(0, 10),
      note: "Too few pivots to label",
    };
  }
  const last = lastTwo[lastTwo.length - 1];
  const prev = lastTwo[lastTwo.length - 2];

  if (last.kind === "H" && lastPrice >= prev.price) {
    // Up trend in progress without a clean 1-2-3-4-5 — call it W1 of a new
    // structure with prior low as invalidation.
    return {
      phase: "W1",
      invalidationPrice: Number(prev.price.toFixed(2)),
      primaryTarget: null,
      confidence: 0.35,
      degree: "Auto (daily, partial)",
      source: "auto-zigzag-v1",
      lastUpdated: new Date().toISOString().slice(0, 10),
      note: "Partial structure — early uptrend",
      pivotsUsed: pivots.length,
    };
  }
  if (last.kind === "L" && lastPrice <= prev.price) {
    return {
      phase: "A",
      invalidationPrice: Number(prev.price.toFixed(2)),
      primaryTarget: null,
      confidence: 0.3,
      degree: "Auto (daily, partial)",
      source: "auto-zigzag-v1",
      lastUpdated: new Date().toISOString().slice(0, 10),
      note: "Partial structure — corrective leg",
      pivotsUsed: pivots.length,
    };
  }
  return {
    phase: "UNKNOWN",
    invalidationPrice: null,
    primaryTarget: null,
    confidence: 0,
    degree: null,
    source: "auto-zigzag-v1",
    lastUpdated: new Date().toISOString().slice(0, 10),
    note: "Ambiguous partial structure",
    pivotsUsed: pivots.length,
  };
}
