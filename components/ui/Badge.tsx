import { clsx } from "./cn";

type Variant = "default" | "success" | "warn" | "danger" | "info";

const styles: Record<Variant, string> = {
  default: "bg-surface-3 text-ink border-line",
  success: "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400 dark:text-black",
  warn:    "bg-amber-500  text-white border-amber-600  dark:bg-amber-400  dark:border-amber-300  dark:text-black",
  danger:  "bg-red-600    text-white border-red-700    dark:bg-red-500    dark:border-red-400    dark:text-white",
  info:    "bg-sky-600    text-white border-sky-700    dark:bg-sky-500    dark:border-sky-400    dark:text-white",
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
