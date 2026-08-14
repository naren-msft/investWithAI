import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DisclosureBanner } from "@/components/screener/DisclosureBanner";
import { Card } from "@/components/ui/Card";
import { ROSS_PROFILE } from "@/config/ross";
import { runScreener } from "@/lib/ross";
import { RossDashboardClient } from "./RossDashboardClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Ross Dashboard · InvestWithAI",
  description:
    "Live Ross 5-Pillars workstation with momentum, continuation, charting, and catalyst news.",
};

export default async function RossDashboardPage({
  searchParams,
}: {
  searchParams?: { ticker?: string | string[] };
}) {
  let data;
  try {
    data = await runScreener({
      profile: ROSS_PROFILE,
      requireExtendedRising: true,
    });
  } catch (error: unknown) {
    return (
      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <DashboardHeader label="Ross Dashboard" />
        <DisclosureBanner />
        <Card className="border-red-500/30">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <h2 className="font-semibold">Ross Dashboard failed to load</h2>
          </div>
          <p className="text-sm subtle mt-2">
            {String((error as Error)?.message ?? error)}
          </p>
        </Card>
      </main>
    );
  }

  const rawTicker = searchParams?.ticker;
  const requestedTicker = Array.isArray(rawTicker)
    ? rawTicker[0]?.trim().toUpperCase()
    : rawTicker?.trim().toUpperCase();
  const initialTicker = requestedTicker || data.rows[0]?.ticker || null;

  return (
    <main className="min-h-screen max-w-[1560px] mx-auto p-3 md:p-4 space-y-3">
      <DashboardHeader label="Ross Dashboard" />
      <DisclosureBanner />
      <RossDashboardClient
        initialResult={data}
        initialTicker={initialTicker}
      />
    </main>
  );
}
