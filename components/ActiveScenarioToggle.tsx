import Link from "next/link";
import { FOMC_SCENARIOS, type FomcScenarioId } from "@/config/fomc-scenarios";
import { FOMC_DECISION_AT_ISO, isAfter } from "@/lib/marketTime";
import { clsx } from "@/components/ui/cn";
import { Lock } from "lucide-react";

const ACCENT_CLASSES: Record<string, string> = {
  blue:  "bg-sky-600 text-white border-sky-700 hover:bg-sky-700",
  green: "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700",
  amber: "bg-amber-500 text-white border-amber-600 hover:bg-amber-600",
  red:   "bg-red-600 text-white border-red-700 hover:bg-red-700",
};

const INACTIVE_CLASSES =
  "bg-surface-2 text-ink border-line hover:bg-surface-3";
const LOCKED_CLASSES =
  "bg-surface-2 text-ink-muted border-line opacity-50 cursor-not-allowed pointer-events-none";

const ORDER: FomcScenarioId[] = ["neutral", "cut", "hold", "hike"];

/**
 * Active-scenario toggle. URL-driven: clicking a pill navigates to
 * `?scenario=<id>` which the /fomc page handler reads to swap target weights
 * for the entire pipeline. State persists in the URL, so it's bookmarkable
 * and shareable. No client state.
 *
 * BEFORE the June-17 2pm-ET FOMC decision, only NEUTRAL is selectable. The
 * cut/hold/hike pills render locked with an explainer so the user can't
 * accidentally execute Phase 1 against a wrong scenario weight column.
 */
export function ActiveScenarioToggle({ active }: { active: FomcScenarioId }) {
  const postFomc = isAfter(FOMC_DECISION_AT_ISO);
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink flex items-center gap-2">
            Active scenario
            {!postFomc && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                <Lock className="w-2.5 h-2.5" /> Locked pre-FOMC
              </span>
            )}
          </h2>
          <p className="text-xs subtle mt-0.5">
            {postFomc
              ? "Pivots target weights, drift, and recommendations for the whole pipeline. Switch this to match the world the Fed delivered."
              : "Phase 1 is deliberately scenario-neutral. The cut / hold / hike columns unlock automatically at June 17, 2026 2:00 PM ET — until then you cannot accidentally execute against a directional bet."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ORDER.map((id) => {
          const meta = FOMC_SCENARIOS[id];
          const isActive = id === active;
          const locked = !postFomc && id !== "neutral";
          const PillTag: any = locked ? "div" : Link;
          const pillProps: any = locked
            ? { title: "Unlocks after FOMC decision (Jun-17 2pm ET)" }
            : { href: `/fomc?scenario=${id}`, prefetch: false };
          return (
            <PillTag
              key={id}
              {...pillProps}
              className={clsx(
                "inline-flex flex-col items-start px-3 py-2 rounded-lg border text-xs transition-colors min-w-[150px]",
                isActive ? ACCENT_CLASSES[meta.accent] : locked ? LOCKED_CLASSES : INACTIVE_CLASSES
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold tracking-tight">{meta.shortLabel}</span>
                {locked && <Lock className="w-2.5 h-2.5" />}
                {meta.probability > 0 && (
                  <span className={clsx(
                    "text-[10px] px-1 py-0 rounded",
                    isActive ? "bg-white/20" : "bg-surface-3"
                  )}>
                    {(meta.probability * 100).toFixed(0)}%
                  </span>
                )}
                {isActive && <span className="text-[10px] uppercase tracking-wide ml-1">active</span>}
              </div>
              <span className={clsx("text-[10px] mt-0.5", isActive ? "opacity-90" : "subtle")}>
                {meta.label}
              </span>
            </PillTag>
          );
        })}
      </div>
      <p className="text-[11px] subtle mt-3">
        <span className="font-mono">{FOMC_SCENARIOS[active].description}</span>
      </p>
    </div>
  );
}
