import { clsx } from "./cn";

export function ProgressBar({
  value,
  max,
  className,
  tone = "brand",
}: {
  value: number;
  max: number;
  className?: string;
  tone?: "brand" | "info" | "warn";
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bar =
    tone === "info" ? "bg-sky-400" : tone === "warn" ? "bg-amber-400" : "bg-brand";
  return (
    <div className={clsx("h-1.5 w-full rounded-full bg-surface-3 overflow-hidden", className)}>
      <div className={clsx("h-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
