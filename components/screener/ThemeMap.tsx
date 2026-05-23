import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { ScreenerResult } from "@/lib/screener/types";

export function ThemeMap({ themes }: { themes: ScreenerResult["themes"] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {themes.map((t) => {
        const passRate = t.counts.total > 0 ? t.counts.passed / t.counts.total : 0;
        return (
          <Card key={t.key} className="!p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-ink">{t.label}</h3>
              <Badge variant={t.counts.passed > 0 ? "success" : "default"}>
                {t.counts.passed}/{t.counts.total} pass
              </Badge>
            </div>
            <p className="text-[11px] subtle leading-snug mb-2">{t.rationale}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {t.counts.core > 0 && <Badge variant="info">{t.counts.core} core</Badge>}
              {t.counts.emerging > 0 && <Badge variant="warn">{t.counts.emerging} emerging</Badge>}
              {t.counts.venture > 0 && <Badge variant="danger">{t.counts.venture} venture</Badge>}
              <span className="ml-auto text-[10px] subtle">
                cap {(t.sleeveCapPct * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${Math.round(passRate * 100)}%` }}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
