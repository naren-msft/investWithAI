// Next.js instrumentation hook — runs once when the server boots.
// Pings the pipeline endpoints every 5 minutes so snapshots get captured
// even when no one is viewing the dashboard.
//
// We hit the HTTP endpoints instead of importing the pipeline directly so
// the Node-only deps (yahoo-finance2, @deno/shim-deno) don't get pulled
// into the edge bundle during build.
declare global {
  // eslint-disable-next-line no-var
  var __investaiPipelineCron: NodeJS.Timeout | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (globalThis.__investaiPipelineCron) return;

  const port = process.env.PORT ?? "3000";
  const base = `http://127.0.0.1:${port}`;
  const urls = [
    `${base}/api/pipeline`,         // ETF
    `${base}/api/stocks/pipeline`,  // Stocks
    `${base}/api/fomc/pipeline`,    // FOMC
  ];

  async function tick() {
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) console.warn(`[investai cron] tick HTTP ${res.status} ${url}`);
      } catch (e) {
        console.warn(`[investai cron] tick failed ${url}:`, (e as Error)?.message);
      }
    }
  }

  // First tick 15s after boot (give the server time to be ready), then
  // every 5 minutes.
  setTimeout(tick, 15_000);
  globalThis.__investaiPipelineCron = setInterval(tick, 5 * 60 * 1000);
  console.log(`[investai cron] pipelines (etf+stocks+fomc) scheduled every 5 minutes`);
}
