"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DriftRow } from "@/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { fmtPct, fmtUsd } from "@/lib/format";

const COLORS = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#f472b6", "#34d399", "#fb923c", "#38bdf8"];

export function AllocationDonut({ rows }: { rows: DriftRow[] }) {
  const data = rows.map((r) => ({ name: r.ticker, value: r.targetPct, usd: r.targetUsd }));
  return (
    <Card>
      <CardHeader title="Target allocation" subtitle="Regime-adjusted target weights." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={75} outerRadius={120} paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgb(var(--surface-1))" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "rgb(var(--surface-1))",
                  border: "1px solid rgb(var(--line))",
                  borderRadius: 10,
                  color: "rgb(var(--ink))",
                }}
                itemStyle={{ color: "rgb(var(--ink))" }}
                labelStyle={{ color: "rgb(var(--ink))" }}
                formatter={(value: any, name: any, props: any) => [
                  `${fmtPct(value)} · ${fmtUsd(props.payload.usd)}`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="font-medium">{d.name}</span>
              <span className="ml-auto font-mono subtle">{fmtPct(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
