import { AlertTriangle } from "lucide-react";

export function DisclosureBanner() {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-50/60 dark:bg-amber-900/20 px-3 py-2 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
      <div className="text-xs text-amber-900 dark:text-amber-100">
        <strong>Research aid — not investment advice.</strong>{" "}
        This screener applies deterministic rules (fundamentals, moat anchors, Minervini-style trend) to a curated theme list.
        Moat claims are <em>manual chokepoint annotations</em>, not algorithmic. Confidence scores reflect rule satisfaction +
        data quality + market regime — not return forecasts. Venture-tagged names (quantum, frontier biotech) carry materially
        higher loss risk. Always do your own due diligence.
      </div>
    </div>
  );
}
