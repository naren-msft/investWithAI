import { clsx } from "./cn";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

const base =
  "inline-flex items-center gap-1.5 rounded-lg text-sm font-medium px-3 py-1.5 transition-colors " +
  "focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50";

const variants = {
  primary: "bg-brand text-black hover:bg-brand-dim",
  ghost:   "bg-surface-3 text-ink hover:bg-surface-3 border border-line",
  link:    "text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 underline-offset-4 hover:underline px-0 py-0",
} as const;

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={clsx(base, variants[variant], className)} {...rest} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return <a className={clsx(base, variants[variant], className)} {...rest} />;
}
