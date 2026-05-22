import type { Tranche } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";

export function DeploymentPlan({
  tranches,
  currentBudget,
}: {
  tranches: Tranche[];
  currentBudget: number;
}) {
  return (
    <Card>
      <CardHeader
        title="Staged capital deployment"
        subtitle="Phased tranches gated by time and SPY drawdown. Tranche size scales with regime."
        right={<Badge variant="info">Next budget {fmtUsd(currentBudget)}</Badge>}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left subtle text-[11px] uppercase tracking-wider">
              <th className="py-2 pr-3">Phase</th>
              <th className="py-2 pr-3 text-right">Nominal size</th>
              <th className="py-2 pr-3">Gate</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {tranches.map((t) => (
              <tr key={t.phase} className="border-t border-line">
                <td className="py-2 pr-3 font-mono">P{t.phase}</td>
                <td className="py-2 pr-3 text-right font-mono">{fmtUsd(t.size)}</td>
                <td className="py-2 pr-3 subtle">{t.gate}</td>
                <td className="py-2 pr-3">
                  <Badge variant={t.status === "next" ? "success" : t.status === "executed" ? "info" : "default"}>
                    {t.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
