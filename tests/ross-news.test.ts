import assert from "node:assert/strict";
import test from "node:test";
import { filterAndRankNews } from "@/lib/ross/news";
import type { RossNewsItem } from "@/lib/ross/types";

const now = Date.parse("2026-08-05T12:00:00Z");
const since = Date.parse("2026-08-04T20:00:00Z");

function news(title: string, publishedAt?: number): RossNewsItem {
  return {
    title,
    link: `https://example.com/${encodeURIComponent(title)}`,
    publishedAt,
    source: "yahoo",
  };
}

test("keeps neutral catalysts and timestamp-less results but rejects negative and stale news", () => {
  const result = filterAndRankNews(
    [
      news("Test Company announces strategic business update", now - 20 * 60_000),
      news("Test Company wins major multi-year contract", now - 40 * 60_000),
      news("Test Company cuts guidance after weak demand", now - 10 * 60_000),
      news("Test Company reports quarterly results", since - 1),
      news("Test Company schedules investor presentation"),
      news("Top pre-market movers to watch", now - 5 * 60_000),
    ],
    since,
    now,
  );

  assert.deepEqual(
    result.map((item) => item.title),
    [
      "Test Company announces strategic business update",
      "Test Company wins major multi-year contract",
      "Test Company schedules investor presentation",
    ],
  );
  assert.equal(result[0].sentimentScore, 0);
  assert.equal(result[1].sentimentScore! > 0, true);
  assert.equal(result[2].publishedAt, undefined);
});
