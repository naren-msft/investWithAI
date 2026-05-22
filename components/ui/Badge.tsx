import { clsx } from "./cn";

type Variant = "default" | "success" | "warn" | "danger" | "info";

const styles: Record<Variant, string> = {
  default: "bg-surface-3 text-ink border-line",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  warn:    "bg-amber-500/15  text-amber-700  dark:text-amber-300  border-amber-500/30",
  danger:  "bg-red-500/15    text-red-700    dark:text-red-300    border-red-500/30",
  info:    "bg-sky-500/15    text-sky-700    dark:text-sky-300    border-sky-500/30",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
