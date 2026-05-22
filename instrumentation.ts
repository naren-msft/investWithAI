// Next.js instrumentation hook — runs once when the server boots.
// Pings the pipeline endpoint every 5 minutes so snapshots get captured
// even when no one is viewing the dashboard.
//
// We hit the HTTP endpoint instead of importing the pipeline directly so
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
  const url = `http://127.0.0.1:${port}/api/pipeline`;

  async function tick() {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) console.warn(`[investai cron] pipeline tick HTTP ${res.status}`);
    } catch (e) {
      console.warn("[investai cron] pipeline tick failed:", (e as Error)?.message);
    }
  }

  // First tick 15s after boot (give the server time to be ready), then
  // every 5 minutes.
  setTimeout(tick, 15_000);
  globalThis.__investaiPipelineCron = setInterval(tick, 5 * 60 * 1000);
  console.log(`[investai cron] pipeline scheduled every 5 minutes (${url})`);
}
