import { getHistory } from "@/lib/yahoo";
import { sma, rsi, adx } from "@/lib/indicators";
import {
  applyHysteresis,
  readHysteresis,
  writeHysteresis,
} from "@/lib/regimeHysteresis";
import type { Regime, RegimeKind } from "@/types";

// 4-mode regime detector — multi-factor + hysteresis.
//
// Inputs: SPY 12mo of daily OHLC.
// Indicators: SMA50, SMA200, RSI(14), ADX(14), drawdown from peak.
//
// Raw classification (before hysteresis):
//   RALLY      — SPY > 50DMA AND 50DMA > 1.02 × 200DMA AND RSI(14) ∈ [55, 75]
//                AND ADX(14) > 25
//   CORRECTION — SPY < 200DMA OR drawdown_from_peak > 15%
//   PULLBACK   — (SPY < 50DMA OR drawdown_from_peak > 7%) AND not Correction
//   NEUTRAL    — everything else
//
// Hysteresis (asymmetric dwell):
//   - Enter Rally / Neutral: 3 confirming days
//   - Enter stress (Pullback/Correction): 2 confirming days (fast into protection)
//   - Exit stress: 5 confirming days (slow out — avoid premature all-clears)

const RALLY_RSI_MIN = 55;
const RALLY_RSI_MAX = 75;
const RALLY_ADX_MIN = 25;
const SMA_CROSS_BUFFER = 1.02; // 50DMA must be 2%+ above 200DMA
const PULLBACK_DD = 0.07;
const CORRECTION_DD = 0.15;

const MULTIPLIERS: Record<RegimeKind, number> = {
  rally: 0.7,
  neutral: 1.0,
  pullback: 1.2,
  correction: 1.5,
};

function classifyRaw(args: {
  spyPrice: number;
  spy50: number;
  spy200: number;
  rsi14: number;
  adx14: number;
  peak: number;
}): RegimeKind {
  const { spyPrice, spy50, spy200, rsi14, adx14, peak } = args;
  const dd = peak > 0 ? (peak - spyPrice) / peak : 0;

  // Correction first (most defensive wins ties)
  if (spyPrice < spy200 || dd > CORRECTION_DD) return "correction";

  // Pullback
  if (spyPrice < spy50 || dd > PULLBACK_DD) return "pullback";

  // Rally requires all conditions
  const rally =
    spyPrice > spy50 &&
    spy50 > SMA_CROSS_BUFFER * spy200 &&
    Number.isFinite(rsi14) && rsi14 >= RALLY_RSI_MIN && rsi14 <= RALLY_RSI_MAX &&
    Number.isFinite(adx14) && adx14 >= RALLY_ADX_MIN;
  if (rally) return "rally";

  return "neutral";
}

export async function detectRegime(): Promise<Regime> {
  const candles = await getHistory("SPY", 12);
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const spy50 = sma(closes, 50);
  const spy200 = sma(closes, 200);
  const spyPrice = closes[closes.length - 1] ?? NaN;
  const pct50 = (spyPrice - spy50) / spy50;
  const pct200 = (spyPrice - spy200) / spy200;

  const rsi14 = rsi(closes, 14);
  const adx14 = adx(highs, lows, closes, 14);

  let peak = 0;
  for (const c of closes) if (c > peak) peak = c;

  const smaCrossSeparation = spy200 > 0 ? (spy50 - spy200) / spy200 : 0;

  const rawKind = classifyRaw({ spyPrice, spy50, spy200, rsi14, adx14, peak });

  // Apply hysteresis — persisted across pipeline runs.
  const todayDate = new Date().toISOString().slice(0, 10);
  const prev = await readHysteresis();
  const { state: nextState, effective } = applyHysteresis(prev, rawKind, todayDate);
  // Only persist if something changed to avoid touching disk every render.
  if (
    nextState.currentRegime !== prev.currentRegime ||
    nextState.pendingRegime !== prev.pendingRegime ||
    nextState.pendingDays !== prev.pendingDays ||
    nextState.lastUpdatedDate !== prev.lastUpdatedDate
  ) {
    writeHysteresis(nextState).catch(() => {});
  }

  const effectiveKind = effective as RegimeKind;

  // Compute dwell required for the *current pending* transition (for UI).
  const isStress = (r: string) => r === "pullback" || r === "correction";
  const dwellRequired = (() => {
    if (!nextState.pendingRegime) return 0;
    const exitingStress = isStress(effectiveKind) && !isStress(nextState.pendingRegime);
    const enteringStress = !isStress(effectiveKind) && isStress(nextState.pendingRegime);
    if (exitingStress) return 5;
    if (enteringStress) return 2;
    return 3;
  })();

  // Build factor breakdown (always reflects RAW conditions today, regardless
  // of which regime is effective — useful for transparency).
  const factors = [
    {
      label: "SPY > 50DMA",
      passed: spyPrice > spy50,
      detail: `${spyPrice.toFixed(2)} vs ${spy50.toFixed(2)} (${(pct50 * 100).toFixed(1)}%)`,
    },
    {
      label: "50DMA > 102% × 200DMA (confirmed cross)",
      passed: spy50 > SMA_CROSS_BUFFER * spy200,
      detail: `50DMA ${(smaCrossSeparation * 100).toFixed(2)}% above 200DMA`,
    },
    {
      label: `RSI(14) ∈ [${RALLY_RSI_MIN}, ${RALLY_RSI_MAX}]`,
      passed: Number.isFinite(rsi14) && rsi14 >= RALLY_RSI_MIN && rsi14 <= RALLY_RSI_MAX,
      detail: Number.isFinite(rsi14) ? rsi14.toFixed(1) : "—",
    },
    {
      label: `ADX(14) > ${RALLY_ADX_MIN}`,
      passed: Number.isFinite(adx14) && adx14 >= RALLY_ADX_MIN,
      detail: Number.isFinite(adx14) ? adx14.toFixed(1) : "—",
    },
    {
      label: "SPY > 200DMA (no correction)",
      passed: spyPrice > spy200,
      detail: `${spyPrice.toFixed(2)} vs ${spy200.toFixed(2)} (${(pct200 * 100).toFixed(1)}%)`,
    },
  ];

  const multiplier = MULTIPLIERS[effectiveKind];

  let reasoning: string;
  switch (effectiveKind) {
    case "rally":
      reasoning =
        `Rally confirmed (all 4 factors true). SPY ${spyPrice.toFixed(2)} > 50DMA ${spy50.toFixed(2)} > ` +
        `1.02 × 200DMA ${(spy200 * SMA_CROSS_BUFFER).toFixed(2)}; RSI(14) ${rsi14.toFixed(1)}; ADX(14) ${adx14.toFixed(1)}. ` +
        `Multiplier ×${multiplier} (lighten new buys — don't chase).`;
      break;
    case "pullback":
      reasoning =
        `Pullback: SPY ${spyPrice.toFixed(2)} below 50DMA or ${((peak - spyPrice) / peak * 100).toFixed(1)}% off 12mo peak. ` +
        `Multiplier ×${multiplier} (deploy modestly more into underweights).`;
      break;
    case "correction":
      reasoning =
        `Correction: SPY ${spyPrice.toFixed(2)} below 200DMA ${spy200.toFixed(2)} or ${((peak - spyPrice) / peak * 100).toFixed(1)}% off 12mo peak. ` +
        `Multiplier ×${multiplier} (aggressively deploy).`;
      break;
    default:
      reasoning =
        `Neutral: not all rally factors met (RSI ${Number.isFinite(rsi14) ? rsi14.toFixed(1) : "—"}, ` +
        `ADX ${Number.isFinite(adx14) ? adx14.toFixed(1) : "—"}, 50DMA-200DMA ${(smaCrossSeparation * 100).toFixed(2)}%) and no correction. ` +
        `Multiplier ×${multiplier}.`;
  }

  // Decorate with hysteresis info
  const hysteresisInfo =
    nextState.pendingRegime && nextState.pendingRegime !== effectiveKind
      ? ` Pending transition to ${nextState.pendingRegime} (${nextState.pendingDays}/${dwellRequired} confirming days).`
      : rawKind !== effectiveKind
        ? ` Raw classification today: ${rawKind} — held at ${effectiveKind} pending confirmation.`
        : "";

  return {
    kind: effectiveKind,
    multiplier,
    inputs: { spy50, spy200, spyPrice, pct50, pct200, rsi14, adx14, smaCrossSeparation },
    reasoning: reasoning + hysteresisInfo,
    factors,
    hysteresis: {
      rawKind,
      effectiveKind,
      pendingKind: (nextState.pendingRegime ?? null) as RegimeKind | null,
      pendingDays: nextState.pendingDays,
      dwellRequired,
    },
  };
}
