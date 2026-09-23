import assert from "node:assert/strict";
import { test } from "node:test";
import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`export * from './lib/orders/fulfilment'; export * from './lib/admin/orders/input';`, {
  "server-only": "", "@/lib/supabase/server": "export const createClient = () => { throw Error('unexpected auth'); };",
});
const statuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "CANCELLED", "UNKNOWN"];
for (const [type, path] of [["DELIVERY", ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]], ["PICKUP", ["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP", "DELIVERED"]]]) {
  for (const from of statuses) for (const to of statuses) {
    test(`${type}: ${from} -> ${to}`, () => {
      const index = path.indexOf(from);
      assert.equal(app.canTransition(type, from, to), index >= 0 && index < 3 && path[index + 1] === to);
    });
  }
}
test("unknown fulfilment type is denied", () => assert.equal(app.canTransition("UNKNOWN", "CONFIRMED", "PROCESSING"), false));
for (const value of ["2028-02-29", "2026-09-20", null]) test(`calendar accepts ${value}`, () => assert.equal(app.calendarDate(value), value));
for (const value of ["2026-02-29", "2028-02-30", "2026-04-31", "2026-1-01", "2026-01-01T00:00:00Z", "0000-01-01", "2026-13-01", "", 20260101, undefined]) {
  test(`calendar rejects ${String(value)}`, () => assert.throws(() => app.calendarDate(value), { status: 400 }));
}
test("Johannesburg calendar rolls over at 22:00 UTC", () => {
  assert.equal(app.johannesburgToday(new Date("2026-09-20T21:59:59Z")), "2026-09-20");
  assert.equal(app.johannesburgToday(new Date("2026-09-20T22:00:00Z")), "2026-09-21");
});
for (const extra of [{ paymentStatus: "PAID" }, { Payment: { status: "PAID" } }, { role: "ADMIN" }, { adminId: "x" }, { userId: "x" }, { processingAt: "2026-01-01" }]) {
  test(`reject request field ${Object.keys(extra)[0]}`, () => assert.throws(() => app.fulfilmentInput({ expectedStatus: "CONFIRMED", targetStatus: "PROCESSING", ...extra }), { status: 400 }));
}
for (const value of [null, [], {}, { expectedStatus: "UNKNOWN", targetStatus: "PAID" }]) {
  test(`reject malformed transition ${JSON.stringify(value)}`, () => assert.throws(() => app.fulfilmentInput(value), { status: 400 }));
}
for (const query of ["limit=0", "limit=51", "limit=2.5", "limit=-1", "status=UNKNOWN", "fulfilmentType=COURIER", "paymentStatus=unknown", "role=ADMIN", "limit=1&limit=2", "cursor=bad", "cursor=%", `search=${"a".repeat(201)}`]) {
  test(`reject query ${query.slice(0, 45)}`, () => assert.throws(() => app.listInput(new URLSearchParams(query)), { status: 400 }));
}
test("cursor binds normalized filters and validates shape/date/id/version", () => {
  const input = app.listInput(new URLSearchParams("search= Alice &status=CONFIRMED"));
  assert.equal(input.search, "Alice"); assert.equal(input.limit, 25);
  const cursor = app.encodeCursor(input, { id: "some-valid-id", createdAt: new Date("2026-01-01") });
  assert.equal(app.listInput(new URLSearchParams({ search: "alice", status: "CONFIRMED", cursor })).cursor.id, "some-valid-id");
  for (const change of [{ search: "Bob" }, { status: "PROCESSING" }, { fulfilmentType: "PICKUP" }, { paymentStatus: "PAID" }]) {
    assert.throws(() => app.listInput(new URLSearchParams({ search: "Alice", status: "CONFIRMED", cursor, ...change })), { status: 400 });
  }
  for (const change of [{ v: 2 }, { id: "bad" }, { createdAt: "2026-02-30" }, { extra: true }]) {
    const data = { ...JSON.parse(Buffer.from(cursor, "base64url")), ...change };
    assert.throws(() => app.listInput(new URLSearchParams({ search: "Alice", status: "CONFIRMED", cursor: Buffer.from(JSON.stringify(data)).toString("base64url") })), { status: 400 });
  }
});
