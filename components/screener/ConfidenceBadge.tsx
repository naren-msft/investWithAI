import { Badge } from "@/components/ui/Badge";
import { bandColor, bandLabel } from "@/lib/screener/score";
import type { ConfidenceScore } from "@/lib/screener/types";

export function ConfidenceBadge({ score }: { score: ConfidenceScore }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm font-semibold text-ink tabular-nums">
        {score.total}
      </span>
      <Badge variant={bandColor(score.band)}>{bandLabel(score.band)}</Badge>
    </span>
  );
}
