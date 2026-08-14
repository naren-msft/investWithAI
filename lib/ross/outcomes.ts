import YahooFinance from "yahoo-finance2";
import {
  completeAlignmentOutcomes,
  pendingAlignmentSnapshots,
  type AlignmentOutcome,
  type PendingAlignmentSnapshot,
  type ScreenerBook,
} from "./history";

const yahooFinance = new YahooFinance();
(yahooFinance as { suppressNotices?: (notices: string[]) => void }).suppressNotices?.([
  "yahooSurvey",
  "ripHistorical",
]);

interface YahooBar {
  date?: Date | string;
  high?: number | null;
  low?: number | null;
  close?: number | null;
}

function pct(value: number, basis: number): number {
  return ((value - basis) / basis) * 100;
}

async function captureOne(
  item: PendingAlignmentSnapshot,
  asOf: string,
): Promise<AlignmentOutcome | null> {
  const scannedMs = Date.parse(item.snapshot.scannedAt);
  const targetMs = scannedMs + 30 * 60 * 1000;
  const giveUpMs = targetMs + 24 * 60 * 60 * 1000;
  try {
    const result = await yahooFinance.chart(
      item.ticker,
      {
        period1: new Date(scannedMs - 60_000),
        period2: new Date(Math.min(Date.parse(asOf), targetMs + 5 * 60_000)),
        interval: "1m",
        includePrePost: true,
      },
      { validateResult: false } as never,
    );
    const bars = ((result as { quotes?: YahooBar[] }).quotes ?? [])
      .map((bar) => ({
        ts: bar.date ? new Date(bar.date).getTime() : NaN,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }))
      .filter(
        (bar) =>
          Number.isFinite(bar.ts) &&
          bar.ts >= scannedMs &&
          bar.ts <= targetMs + 5 * 60_000 &&
          bar.close != null,
      );
    if (bars.length === 0) {
      if (Date.parse(asOf) < giveUpMs) return null;
      return {
        status: "unavailable",
        capturedAt: asOf,
        targetAt: new Date(targetMs).toISOString(),
        price30m: null,
        high30m: null,
        low30m: null,
        returnPct: null,
        maxGainPct: null,
        maxDrawdownPct: null,
      };
    }

    const last = bars.reduce((best, bar) =>
      Math.abs(bar.ts - targetMs) < Math.abs(best.ts - targetMs) ? bar : best,
    );
    const highs = bars.map((bar) => bar.high).filter((v): v is number => v != null);
    const lows = bars.map((bar) => bar.low).filter((v): v is number => v != null);
    const high = highs.length > 0 ? Math.max(...highs) : last.close!;
    const low = lows.length > 0 ? Math.min(...lows) : last.close!;
    return {
      status: "captured",
      capturedAt: asOf,
      targetAt: new Date(targetMs).toISOString(),
      price30m: last.close!,
      high30m: high,
      low30m: low,
      returnPct: pct(last.close!, item.snapshot.scanPrice),
      maxGainPct: pct(high, item.snapshot.scanPrice),
      maxDrawdownPct: pct(low, item.snapshot.scanPrice),
    };
  } catch {
    return Date.parse(asOf) >= giveUpMs
      ? {
          status: "unavailable",
          capturedAt: asOf,
          targetAt: new Date(targetMs).toISOString(),
          price30m: null,
          high30m: null,
          low30m: null,
          returnPct: null,
          maxGainPct: null,
          maxDrawdownPct: null,
        }
      : null;
  }
}

/** Settle due +30-minute validation observations without blocking on failures. */
export async function settleAlignmentOutcomes(book: ScreenerBook, asOf: string): Promise<void> {
  const pending = await pendingAlignmentSnapshots(book, asOf);
  if (pending.length === 0) return;
  const completed: Array<{
    book: ScreenerBook;
    day: string;
    ticker: string;
    snapshotId: string;
    outcome: AlignmentOutcome;
  }> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      const outcome = await captureOne(item, asOf);
      if (outcome) {
        completed.push({
          book,
          day: item.day,
          ticker: item.ticker,
          snapshotId: item.snapshot.id,
          outcome,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, () => worker()));
  await completeAlignmentOutcomes(completed);
}
