import { isSameDayPostCloseResearchWindowEt } from "@/lib/marketTime";
import type { RossResult, RossRow } from "./types";

type MarketSession = RossResult["marketSession"];
type RowExtendedSession = RossRow["extendedSession"];

export type ExtendedHoursDisplayMode =
  | "pre-market"
  | "regular-premarket-context"
  | "after-hours"
  | "post-close-research"
  | "neutral";

function asDate(asOf: string | Date): Date | null {
  const date = asOf instanceof Date ? asOf : new Date(asOf);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function extendedHoursDisplayMode(
  marketSession: MarketSession,
  asOf: string | Date,
): ExtendedHoursDisplayMode {
  if (marketSession === "pre-market") return "pre-market";
  if (marketSession === "regular") return "regular-premarket-context";
  if (marketSession === "after-hours") return "after-hours";

  const at = asDate(asOf);
  if (
    marketSession === "closed" &&
    at != null &&
    isSameDayPostCloseResearchWindowEt(at)
  ) {
    return "post-close-research";
  }

  return "neutral";
}

export function extendedHoursColumnLabel(
  marketSession: MarketSession,
  asOf: string | Date,
): string {
  switch (extendedHoursDisplayMode(marketSession, asOf)) {
    case "pre-market":
      return "Pre-mkt %";
    case "regular-premarket-context":
      return "Gap (PM)";
    case "after-hours":
    case "post-close-research":
      return "After-hrs %";
    default:
      return "Ext. hrs";
  }
}

export function risingExtendedLabel(
  marketSession: MarketSession,
  asOf: string | Date,
): string {
  switch (extendedHoursDisplayMode(marketSession, asOf)) {
    case "pre-market":
    case "regular-premarket-context":
      return "Rising pre-mkt";
    case "after-hours":
    case "post-close-research":
      return "Rising after-hrs";
    default:
      return "Rising ext. hrs";
  }
}

export interface ExtendedHoursDisplayCopy {
  label: string;
  cue: string | null;
  title: string;
  tag: "PM" | "AH" | null;
}

export function extendedHoursDisplayCopy(
  marketSession: MarketSession,
  rowSession: RowExtendedSession,
  asOf: string | Date,
): ExtendedHoursDisplayCopy {
  const mode = extendedHoursDisplayMode(marketSession, asOf);

  if (rowSession === "premarket") {
    if (mode === "regular-premarket-context") {
      return {
        label: "Gap (PM)",
        cue: "gap today",
        title:
          "Today's retained pre-market gap context from before the open — not a live extended-hours signal.",
        tag: "PM",
      };
    }
    if (mode === "pre-market") {
      return {
        label: "PM Gap",
        cue: null,
        title: "Live pre-market gap.",
        tag: "PM",
      };
    }
  }

  if (rowSession === "afterhours") {
    if (mode === "post-close-research") {
      return {
        label: "AH Move",
        cue: null,
        title:
          "Same-day post-close after-hours move retained for evening research.",
        tag: "AH",
      };
    }
    if (mode === "after-hours") {
      return {
        label: "AH Move",
        cue: null,
        title: "Live after-hours move.",
        tag: "AH",
      };
    }
  }

  return {
    label: "Ext. hrs",
    cue: null,
    title: "Extended-hours context unavailable.",
    tag: rowSession === "premarket" ? "PM" : rowSession === "afterhours" ? "AH" : null,
  };
}

export interface ExtendedDirectionControlCopy {
  label: string;
  hint: string;
  detail: string;
  statusEnabled: string;
  statusDisabled: string;
}

export function extendedDirectionControlCopy(
  marketSession: MarketSession,
  asOf: string | Date,
): ExtendedDirectionControlCopy {
  switch (extendedHoursDisplayMode(marketSession, asOf)) {
    case "pre-market":
      return {
        label: "📈 Extended-session direction",
        hint: "— filters on live pre-market direction",
        detail:
          "Applied server-side to the scanner — price band, RVol, change %, float/market cap, and active pre-market direction.",
        statusEnabled: "📈 pre-mkt risers only",
        statusDisabled: "⚠ incl. pre-mkt fallers",
      };
    case "regular-premarket-context":
      return {
        label: "📈 Extended-session direction",
        hint: "— regular hours keep today’s PM gap for context/ranking",
        detail:
          "Applied server-side to the scanner — price band, RVol, change %, float/market cap, plus today’s retained pre-market gap for regular-session context/ranking (not a live extended-hours signal).",
        statusEnabled: "📊 PM gap context/ranking",
        statusDisabled: "📊 PM gap context/ranking",
      };
    case "after-hours":
      return {
        label: "📈 Extended-session direction",
        hint: "— filters on live after-hours direction",
        detail:
          "Applied server-side to the scanner — price band, RVol, change %, float/market cap, and active after-hours direction.",
        statusEnabled: "📈 after-hrs risers only",
        statusDisabled: "⚠ incl. after-hrs fallers",
      };
    case "post-close-research":
      return {
        label: "📈 Extended-session direction",
        hint: "— same-day post-close after-hours context",
        detail:
          "Applied server-side to the scanner — price band, RVol, change %, float/market cap, and same-day post-close after-hours direction.",
        statusEnabled: "📈 post-close AH risers only",
        statusDisabled: "⚠ incl. post-close AH fallers",
      };
    default:
      return {
        label: "📈 Extended-session direction",
        hint: "— active AH/PM filters resume when fresh data returns",
        detail:
          "Applied server-side to the scanner — price band, RVol, change %, float/market cap, and extended-hours direction whenever pre-market or after-hours data is active.",
        statusEnabled: "📈 ext. hrs filter when active",
        statusDisabled: "⚠ incl. ext. hrs fallers when active",
      };
  }
}
