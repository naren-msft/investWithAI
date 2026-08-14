import {
  isSameDayPostCloseResearchWindowEt,
  type MarketSession,
} from "@/lib/marketTime";
import { ALIGNMENT_HISTORY_MIN_MS, type TickerHistory } from "./history";
import type {
  RossAlignmentSignal,
  RossNewsItem,
  RossRow,
  RossSignalAlignment,
} from "./types";

function verifiedFreshNews(news: RossNewsItem[], sinceMs: number, asOfMs: number): RossNewsItem[] {
  return news.filter(
    (item) =>
      item.publishedAt != null &&
      item.publishedAt >= sinceMs &&
      item.publishedAt <= asOfMs,
  );
}

function catalystMomentumSignal(
  row: RossRow,
  newsSince: string,
  asOf: string,
): RossAlignmentSignal {
  if (!row.strongMomentum) {
    return {
      key: "catalystMomentum",
      label: "Fresh catalyst + strong momentum",
      state: "not-aligned",
      detail: "The move is below the strong-momentum threshold.",
    };
  }

  const fresh = verifiedFreshNews(row.news, Date.parse(newsSince), Date.parse(asOf));
  if (fresh.length > 0) {
    return {
      key: "catalystMomentum",
      label: "Fresh catalyst + strong momentum",
      state: "aligned",
      detail: "Strong momentum is supported by a timestamp-verified fresh catalyst.",
    };
  }
  if (row.news.some((item) => item.publishedAt == null)) {
    return {
      key: "catalystMomentum",
      label: "Fresh catalyst + strong momentum",
      state: "unknown",
      detail: "Strong momentum has a possible catalyst, but its timestamp is unverified.",
    };
  }
  return {
    key: "catalystMomentum",
    label: "Fresh catalyst + strong momentum",
    state: "not-aligned",
    detail: "Strong momentum has no timestamp-verified fresh catalyst.",
  };
}

function extendedContinuationSignal(
  row: RossRow,
  session: MarketSession,
  asOf: string,
): RossAlignmentSignal {
  const researchWindow =
    session === "closed" && isSameDayPostCloseResearchWindowEt(new Date(asOf));
  if (session === "regular") {
    return {
      key: "extendedContinuation",
      label: "Live extended-hours continuation",
      state: "not-aligned",
      detail: "Pre-market data is stale during the regular session and earns no point.",
    };
  }
  if (session !== "pre-market" && session !== "after-hours" && !researchWindow) {
    return {
      key: "extendedContinuation",
      label: "Live extended-hours continuation",
      state: "unknown",
      detail: "There is no active extended-hours session.",
    };
  }
  if (row.extendedChangePct == null) {
    return {
      key: "extendedContinuation",
      label: "Live extended-hours continuation",
      state: "unknown",
      detail: "The active extended-session change is unavailable.",
    };
  }
  return {
    key: "extendedContinuation",
    label: "Live extended-hours continuation",
    state: row.extendedChangePct > 0 ? "aligned" : "not-aligned",
    detail:
      row.extendedChangePct > 0
        ? `The active extended session is up ${row.extendedChangePct.toFixed(1)}%.`
        : `The active extended session is not rising (${row.extendedChangePct.toFixed(1)}%).`,
  };
}

function rvolAccelerationSignal(
  row: RossRow,
  history: TickerHistory | undefined,
  asOf: string,
): RossAlignmentSignal {
  const prevAt = history?.prevObservedAt ? Date.parse(history.prevObservedAt) : NaN;
  const spanMs = Number.isFinite(prevAt) ? Date.parse(asOf) - prevAt : 0;
  const previous = history?.prevRvol ?? null;
  const current = history?.lastRvol ?? row.currentRvol ?? row.candidate.relativeVolume ?? null;
  if (
    previous == null ||
    current == null ||
    spanMs < ALIGNMENT_HISTORY_MIN_MS
  ) {
    return {
      key: "rvolAcceleration",
      label: "RVol accelerating",
      state: "unknown",
      detail: "At least two minutes of comparable RVol history is required.",
    };
  }

  const delta = current - previous;
  const minimumMove = Math.max(0.2, Math.abs(previous) * 0.05);
  return {
    key: "rvolAcceleration",
    label: "RVol accelerating",
    state: delta >= minimumMove ? "aligned" : "not-aligned",
    detail:
      delta >= minimumMove
        ? `RVol increased ${delta.toFixed(1)}x over ${Math.round(spanMs / 60000)} minutes.`
        : `RVol did not increase meaningfully over ${Math.round(spanMs / 60000)} minutes.`,
  };
}

function repeatedHoldingSignal(
  row: RossRow,
  history: TickerHistory | undefined,
  asOf: string,
): RossAlignmentSignal {
  const firstAt = history?.firstQualifiedAt ? Date.parse(history.firstQualifiedAt) : NaN;
  const lastAt = history?.lastSeenAt ? Date.parse(history.lastSeenAt) : NaN;
  const spanMs = Number.isFinite(firstAt) ? Date.parse(asOf) - firstAt : 0;
  const observationGapMs = Number.isFinite(lastAt) ? Date.parse(asOf) - lastAt : Infinity;
  if (
    !history ||
    history.qualifiedSeenCount == null ||
    history.qualifiedSeenCount < 2 ||
    spanMs < ALIGNMENT_HISTORY_MIN_MS ||
    observationGapMs > 90 * 1000
  ) {
    return {
      key: "repeatedHolding",
      label: "Repeated detection without fading",
      state: "unknown",
      detail: "Two recent qualified detections spanning two minutes are required.",
    };
  }

  const current = row.currentChangePct;
  const peak = history.peakQualifiedChangePct ?? history.peakChangePct;
  if (current == null || peak == null) {
    return {
      key: "repeatedHolding",
      label: "Repeated detection without fading",
      state: "unknown",
      detail: "Change history is incomplete.",
    };
  }
  const allowedFade = Math.max(2, Math.abs(peak) * 0.2);
  const holding = peak - current <= allowedFade;
  return {
    key: "repeatedHolding",
    label: "Repeated detection without fading",
    state: holding ? "aligned" : "not-aligned",
    detail: holding
      ? `Qualified on ${history.qualifiedSeenCount} scans and remains near its ${peak.toFixed(1)}% peak.`
      : `The move faded ${(peak - current).toFixed(1)} points from its qualified peak.`,
  };
}

export function buildSignalAlignment(
  row: RossRow,
  history: TickerHistory | undefined,
  session: MarketSession,
  newsSince: string,
  asOf: string,
): RossSignalAlignment | null {
  if (row.stage !== "qualified" || !row.allAutomatedMet) return null;

  const signals = [
    catalystMomentumSignal(row, newsSince, asOf),
    extendedContinuationSignal(row, session, asOf),
    rvolAccelerationSignal(row, history, asOf),
    repeatedHoldingSignal(row, history, asOf),
  ];
  return {
    alignedCount: signals.filter((signal) => signal.state === "aligned").length,
    knownCount: signals.filter((signal) => signal.state !== "unknown").length,
    total: 4,
    confidence: row.floatUnknown ? "low" : "normal",
    signals,
  };
}
