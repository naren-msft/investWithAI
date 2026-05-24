// Pure-math momentum signals computed from already-fetched OHLCV data.
// All helpers return null when there is insufficient data to make the
// computation meaningful — never throw.

/**
 * Relative strength vs a benchmark. Mansfield-style ratio of cumulative
 * returns over `lookback` trading days. Values > 1 indicate the stock
 * outperformed the benchmark; values < 1 indicate underperformance.
 *
 * Returns null when either series is shorter than `lookback + 1` bars
 * or when the benchmark return is zero/negative (denominator unsafe).
 */
export function relativeStrength(
  stockCloses: number[],
  benchCloses: number[],
  lookback = 252,
): number | null {
  if (stockCloses.length <= lookback || benchCloses.length <= lookback) return null;
  const s0 = stockCloses[stockCloses.length - 1 - lookback];
  const s1 = stockCloses[stockCloses.length - 1];
  const b0 = benchCloses[benchCloses.length - 1 - lookback];
  const b1 = benchCloses[benchCloses.length - 1];
  if (!Number.isFinite(s0) || !Number.isFinite(s1) || s0 <= 0) return null;
  if (!Number.isFinite(b0) || !Number.isFinite(b1) || b0 <= 0) return null;
  const stockReturn = s1 / s0;
  const benchReturn = b1 / b0;
  if (benchReturn <= 0) return null;
  return stockReturn / benchReturn;
}

/**
 * "Frog in the Pan" — Da, Gurun & Warachka (2014) — measures *continuous*
 * (vs. discrete) attention. We approximate by counting positive vs. negative
 * close-to-close days over a window; the more balanced and small the daily
 * moves, the higher the "stealth grind" score. Returns (posDays − negDays) /
 * totalDays in range [-1, 1].
 */
export function frogInPan(closes: number[], window = 126): number | null {
  if (closes.length < 2) return null;
  const w = Math.min(window, closes.length - 1);
  let pos = 0;
  let neg = 0;
  for (let i = closes.length - w; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) pos++;
    else if (d < 0) neg++;
  }
  const total = pos + neg;
  if (total === 0) return null;
  return (pos - neg) / total;
}

/**
 * Volume thrust — most recent bar volume divided by SMA(50) volume.
 * Values ≥ 1.5 historically associate with breakouts (O'Neil CANSLIM).
 */
export function volumeThrust(volumes: number[], window = 50): number | null {
  if (volumes.length < window + 1) return null;
  const recent = volumes.slice(-window);
  const avg = recent.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) / window;
  const last = volumes[volumes.length - 1];
  if (!Number.isFinite(last) || avg <= 0) return null;
  return last / avg;
}

/**
 * Base length — trading days since price last closed > 5% above the rolling
 * 6-month max prior to that day. Loosely measures how "tight" the current
 * consolidation has been; longer bases (≥ 40 bars) historically precede the
 * highest-quality breakouts.
 *
 * Returns null when there is insufficient history (< 130 closes).
 */
export function baseLength(closes: number[], breakoutPct = 0.05): number | null {
  if (closes.length < 130) return null;
  const lookback = 126;
  // Walk backwards from most recent bar; for each prior bar, check whether
  // it broke out > breakoutPct above its trailing 126-bar max.
  for (let offset = 1; offset <= Math.min(closes.length - lookback - 1, 252); offset++) {
    const idx = closes.length - 1 - offset;
    const windowStart = Math.max(0, idx - lookback);
    let maxPrior = -Infinity;
    for (let j = windowStart; j < idx; j++) if (closes[j] > maxPrior) maxPrior = closes[j];
    if (closes[idx] > maxPrior * (1 + breakoutPct)) return offset;
  }
  // No breakout in the last 252 bars — base length is at least that long.
  return Math.min(252, closes.length - lookback - 1);
}

/** 20-day momentum: (last close − close 20d ago) / close 20d ago. */
export function momentum20d(closes: number[]): number | null {
  if (closes.length < 21) return null;
  const a = closes[closes.length - 21];
  const b = closes[closes.length - 1];
  if (!Number.isFinite(a) || a <= 0) return null;
  return (b - a) / a;
}
