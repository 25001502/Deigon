import assert from "node:assert/strict";
import { test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`export { nextProductUpdatedAt } from './lib/admin/products/concurrency';`, {
  "server-only": "",
});

test("same-millisecond clock advances the Product token by one millisecond", () => {
  const current = new Date("2026-09-27T12:00:00.123Z");
  assert.equal(
    app.nextProductUpdatedAt(current, new Date("2026-09-27T12:00:00.123Z")).toISOString(),
    "2026-09-27T12:00:00.124Z",
  );
});

test("later wall clock becomes the Product token", () => {
  const current = new Date("2026-09-27T12:00:00.123Z");
  assert.equal(
    app.nextProductUpdatedAt(current, new Date("2026-09-27T12:00:00.900Z")).toISOString(),
    "2026-09-27T12:00:00.900Z",
  );
});

test("clock behind the Product token advances from the existing token", () => {
  const current = new Date("2026-09-27T12:00:00.500Z");
  assert.equal(
    app.nextProductUpdatedAt(current, new Date("2026-09-27T12:00:00.100Z")).toISOString(),
    "2026-09-27T12:00:00.501Z",
  );
});
