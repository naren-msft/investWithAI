import Link from "next/link";
import { Home } from "lucide-react";

// Shared breadcrumb header that appears at the top of each portfolio
// dashboard. Provides a clear way back to the chooser landing and a label
// indicating which portfolio (ETF / Stocks) is currently active.
export function DashboardHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 -mb-1">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs subtle hover:text-ink transition-colors">
        <Home className="w-3.5 h-3.5" />
        Home
      </Link>
      <div className="text-[11px] uppercase tracking-wider subtle">
        Dashboard · <span className="text-ink font-medium">{label}</span>
      </div>
    </div>
  );
}
