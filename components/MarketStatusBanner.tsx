"use client";

import { useEffect, useState } from "react";
import { Clock, CalendarX, Moon, Sunrise, AlertTriangle } from "lucide-react";
import {
  formatCountdown,
  formatEt,
  getMarketStatus,
  type MarketStatus,
} from "@/lib/marketStatus";

/**
 * Banner shown when the US equity market is closed (weekend, holiday,
 * pre-market, after-hours) — or a thin warning strip when today is an
 * early-close trading day. Re-evaluates state every second so the
 * countdown ticks and the banner auto-flips at session boundaries.
 *
 * Returns null when markets are fully open and today is a normal session
 * (so the parent can render the live ticker instead).
 */
export function MarketStatusBanner() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Don't render anything during SSR / first client paint to avoid a
  // timezone-driven hydration flash.
  if (!now) return null;

  const status = getMarketStatus(now);

  if (status.state === "open") return null;

  if (status.state === "early-close") {
    // Market is open but closes early today.
    return <EarlyCloseStrip status={status} now={now} />;
  }

  return <ClosedBanner status={status} now={now} />;
}

function ClosedBanner({ status, now }: { status: MarketStatus; now: Date }) {
  const msToOpen = status.nextOpen.getTime() - now.getTime();
  const { icon: Icon, title, accent } = closedPresentation(status);

  return (
    <div
      className={`card !p-0 overflow-hidden border ${accent.border} ${accent.bg}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${accent.icon}`} />
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${accent.title}`}>{title}</div>
            <div className={`text-[11px] ${accent.subtle}`}>
              {status.reason}
              {status.isEarlyCloseDay && status.state === "closed-afterhours" ? " · early close today" : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <div className="text-right">
            <div className={`text-[10px] uppercase tracking-wider ${accent.subtle}`}>Next open</div>
            <div className={`text-xs font-mono ${accent.title}`}>
              {formatEt(status.nextOpen, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-[10px] uppercase tracking-wider ${accent.subtle} flex items-center justify-end gap-1`}>
              <Clock className="w-3 h-3" />
              Opens in
            </div>
            <div className={`text-base font-mono font-semibold tabular-nums ${accent.title}`}>
              {formatCountdown(msToOpen)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EarlyCloseStrip({ status, now }: { status: MarketStatus; now: Date }) {
  const msToClose = status.nextClose ? status.nextClose.getTime() - now.getTime() : 0;
  return (
    <div
      className="card !p-0 overflow-hidden border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs">
        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="font-semibold">Early close today</span>
          <span className="text-amber-800/80 dark:text-amber-200/80">
            {status.reason || "Market closes at 1:00pm ET"}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-amber-900 dark:text-amber-100">
          <span className="text-[10px] uppercase tracking-wider text-amber-800/80 dark:text-amber-200/80">
            Closes at
          </span>
          <span className="font-mono">
            {status.nextClose ? formatEt(status.nextClose) : "1:00 PM ET"}
          </span>
          <span className="font-mono tabular-nums font-semibold">
            (in {formatCountdown(msToClose)})
          </span>
        </div>
      </div>
    </div>
  );
}

function closedPresentation(status: MarketStatus) {
  switch (status.state) {
    case "closed-weekend":
      return {
        icon: CalendarX,
        title: "US markets are closed — Weekend",
        accent: slate(),
      };
    case "closed-holiday":
      return {
        icon: CalendarX,
        title: `US markets are closed — ${status.reason}`,
        accent: slate(),
      };
    case "closed-premarket":
      return {
        icon: Sunrise,
        title: "Pre-market — US markets not yet open",
        accent: slate(),
      };
    case "closed-afterhours":
      return {
        icon: Moon,
        title: "After hours — US markets are closed",
        accent: slate(),
      };
    default:
      return { icon: CalendarX, title: "US markets are closed", accent: slate() };
  }
}

function slate() {
  return {
    border: "border-line",
    bg: "bg-surface-2",
    icon: "text-ink-muted",
    title: "text-ink",
    subtle: "subtle",
  };
}
