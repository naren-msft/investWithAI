import { getCloseSeries } from "@/lib/yahoo";
import { macd, rsi } from "@/lib/indicators";
import type { AgentResult, SignalRow, TargetWeight } from "@/types";

// Spec rules:
//   RSI ≤ 35 → BUY (oversold entry)
//   RSI ≥ 70 → AVOID (overbought)
//   Otherwise: HOLD (still ok-to-buy via drift fallback)
//   MACD bullish (hist > 0 and rising) reinforces BUY when RSI is neutral.
export async function signalAnalysisAgent(
  targets: TargetWeight[]
): Promise<AgentResult<SignalRow[]>> {
  const rows = await Promise.all(
    targets.map(async (t): Promise<SignalRow> => {
      try {
        const closes = await getCloseSeries(t.ticker, 9);
        const r = rsi(closes, 14);
        const m = macd(closes);
        // Previous bar's MACD hist for "rising" check.
        const mPrev = macd(closes.slice(0, -1));
        const macdRising = !Number.isNaN(m.hist) && !Number.isNaN(mPrev.hist) && m.hist > mPrev.hist;
        const macdBullish = !Number.isNaN(m.hist) && m.hist > 0 && macdRising;

        let signal: SignalRow["signal"];
        let reason: string;
        if (Number.isNaN(r) || Number.isNaN(m.hist)) {
          signal = "HOLD";
          reason = "Insufficient history; default HOLD (drift fallback still applies).";
        } else if (r >= 70) {
          signal = "AVOID";
          reason = `RSI ${r.toFixed(1)} ≥ 70 — overbought, do not buy now.`;
        } else if (r <= 35) {
          signal = "BUY";
          reason = `RSI ${r.toFixed(1)} ≤ 35 — oversold buy zone${macdBullish ? " · MACD bullish confirmation" : ""}.`;
        } else if (macdBullish) {
          signal = "BUY";
          reason = `RSI ${r.toFixed(1)} neutral but MACD hist ${m.hist.toFixed(3)} rising > 0 — bullish confirmation.`;
        } else {
          signal = "HOLD";
          reason = `RSI ${r.toFixed(1)} / MACD hist ${m.hist.toFixed(3)} — no decisive setup (drift-fallback still applies).`;
        }
        return { ticker: t.ticker, signal, rsi: r, macdHist: m.hist, reason };
      } catch (e: any) {
        return { ticker: t.ticker, signal: "HOLD", rsi: NaN, macdHist: NaN, reason: `Data error: ${e?.message ?? e}` };
      }
    })
  );

  const buys   = rows.filter((r) => r.signal === "BUY"  ).map((r) => r.ticker).join(", ") || "none";
  const avoids = rows.filter((r) => r.signal === "AVOID").map((r) => r.ticker).join(", ") || "none";
  const reasoning = `RSI-14 + MACD(12,26,9) scan. BUY: ${buys}. AVOID: ${avoids}.`;

  return { agent: "SignalAnalysisAgent", output: rows, reasoning };
}
