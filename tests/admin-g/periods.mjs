import assert from "node:assert/strict";
import { test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const { dashboardPeriods, storedUtcTimestamp, compareMoney, compareCounts, averageOrderValue } = await bundle(`
  export * from './lib/admin/dashboard/periods';
  export * from './lib/admin/dashboard/comparisons';
`);

const iso = (date) => date.toISOString();

test("October MTD and comparable September use the same SAST day and time", () => {
  const p = dashboardPeriods(new Date("2026-10-18T12:30:00.000Z"));
  assert.equal(iso(p.current.start), "2026-09-30T22:00:00.000Z");
  assert.equal(iso(p.current.end), "2026-10-18T12:30:00.000Z");
  assert.equal(iso(p.previousComparable.start), "2026-08-31T22:00:00.000Z");
  assert.equal(iso(p.previousComparable.end), "2026-09-18T12:30:00.000Z");
  assert.deepEqual(p.trendMonths, ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
});

test("January comparison wraps to December", () => {
  const p = dashboardPeriods(new Date("2027-01-15T08:00:00.000Z"));
  assert.equal(iso(p.current.start), "2026-12-31T22:00:00.000Z");
  assert.equal(iso(p.previousComparable.start), "2026-11-30T22:00:00.000Z");
  assert.equal(iso(p.previousComparable.end), "2026-12-15T08:00:00.000Z");
  assert.equal(p.trendMonths[0], "2026-08");
});

test("31 March caps February comparison at 1 March SAST", () => {
  const p = dashboardPeriods(new Date("2026-03-31T12:30:00.000Z"));
  assert.equal(iso(p.previousComparable.start), "2026-01-31T22:00:00.000Z");
  assert.equal(iso(p.previousComparable.end), "2026-02-28T22:00:00.000Z");
});

test("30/31-day and leap-year comparisons clamp only when the day is absent", () => {
  const may31 = dashboardPeriods(new Date("2026-05-31T10:01:02.003Z"));
  assert.equal(iso(may31.previousComparable.end), "2026-04-30T22:00:00.000Z");
  const leap29 = dashboardPeriods(new Date("2024-03-29T10:01:02.003Z"));
  assert.equal(iso(leap29.previousComparable.end), "2024-02-29T10:01:02.003Z");
  const leap31 = dashboardPeriods(new Date("2024-03-31T10:01:02.003Z"));
  assert.equal(iso(leap31.previousComparable.end), "2024-02-29T22:00:00.000Z");
});

test("UTC wall-clock bridge never includes a timezone suffix", () => {
  assert.equal(storedUtcTimestamp(new Date("2026-09-30T22:00:00.000Z")), "2026-09-30T22:00:00.000");
  assert.throws(() => dashboardPeriods(new Date("invalid")), RangeError);
});

test("money and count comparisons use exact Decimal percentages and explicit zero states", () => {
  assert.deepEqual(compareMoney("12000.00", "10000.00"), { direction: "UP", percentage: "20.0", absoluteDelta: "2000.00" });
  assert.deepEqual(compareMoney("8000.00", "10000.00"), { direction: "DOWN", percentage: "-20.0", absoluteDelta: "2000.00" });
  assert.deepEqual(compareMoney("0.00", "0.00"), { direction: "FLAT", percentage: null, absoluteDelta: "0.00" });
  assert.deepEqual(compareMoney("0.01", "0.00"), { direction: "NEW", percentage: null, absoluteDelta: "0.01" });
  assert.deepEqual(compareCounts(3, 2), { direction: "UP", percentage: "50.0", absoluteDelta: 1 });
  assert.deepEqual(compareCounts(0, 0), { direction: "FLAT", percentage: null, absoluteDelta: 0 });
});

test("AOV preserves cents, rounds explicitly, and has no zero-order value", () => {
  assert.equal(averageOrderValue("0.00", 0), null);
  assert.equal(averageOrderValue("0.10", 3), "0.03");
  assert.equal(averageOrderValue("0.02", 4), "0.01");
});
