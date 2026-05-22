import { clsx } from "@/components/ui/cn";
import { HelpLink } from "@/components/ui/HelpLink";
import type { HTMLAttributes, PropsWithChildren } from "react";

export function Card({ className, children, ...rest }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={clsx("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  helpSection,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  helpSection?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          {helpSection && <HelpLink section={helpSection} />}
        </div>
        {subtitle && <p className="text-xs subtle mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
