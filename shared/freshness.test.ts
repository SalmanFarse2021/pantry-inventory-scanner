import { test } from "node:test";
import assert from "node:assert/strict";
import { isStale, timeAgo } from "./freshness";

const now = Date.parse("2026-10-12T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("timeAgo picks the largest whole unit", () => {
  assert.equal(timeAgo(ago(10_000), now), "just now");
  assert.equal(timeAgo(ago(5 * 60_000), now), "5m ago");
  assert.equal(timeAgo(ago(3 * 3_600_000), now), "3h ago");
  assert.equal(timeAgo(ago(2 * 86_400_000), now), "2d ago");
});

test("stale after a week, or when never updated", () => {
  assert.equal(isStale(ago(6 * 86_400_000), now), false);
  assert.equal(isStale(ago(8 * 86_400_000), now), true);
  assert.equal(isStale(null, now), true);
});
