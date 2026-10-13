import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const parser = await bundle(`export { parseAddress } from './lib/account/parse-address';`, {
  "@/lib/api/errors": `
    export class ApiError extends Error {
      constructor(message, status) { super(message); this.name = "ApiError"; this.status = status; }
    }
  `,
});

function validAddress(overrides = {}) {
  return {
    fullName: "  Ada Lovelace  ",
    addressLine1: "  12 Main Road  ",
    city: "  Johannesburg  ",
    province: "  Gauteng  ",
    postalCode: "  2000  ",
    ...overrides,
  };
}

test("shared parser preserves required fields, trimming and optional defaults", () => {
  assert.deepEqual(parser.parseAddress(validAddress()), {
    fullName: "Ada Lovelace",
    addressLine1: "12 Main Road",
    addressLine2: null,
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "2000",
    country: "South Africa",
    phone: null,
  });

  assert.deepEqual(parser.parseAddress(validAddress({
    addressLine2: "  Unit 4  ",
    country: "  South Africa  ",
    phone: "  0123456789  ",
  })), {
    fullName: "Ada Lovelace",
    addressLine1: "12 Main Road",
    addressLine2: "Unit 4",
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "2000",
    country: "South Africa",
    phone: "0123456789",
  });
});

test("shared parser preserves the existing validation errors and status codes", () => {
  for (const [body, message] of [
    [null, "Request body must be an object"],
    [validAddress({ city: undefined }), "city is required"],
    [validAddress({ fullName: 42 }), "fullName is required"],
    [validAddress({ addressLine2: 42 }), "addressLine2 must be a string"],
    [validAddress({ country: false }), "country must be a string"],
    [validAddress({ phone: [] }), "phone must be a string"],
  ]) {
    assert.throws(() => parser.parseAddress(body), (error) => {
      assert.equal(error.name, "ApiError");
      assert.equal(error.message, message);
      assert.equal(error.status, 400);
      return true;
    });
  }
});

test("both address routes import the shared parser and expose only supported route handlers", () => {
  const collection = readFileSync(new URL("../../app/api/account/addresses/route.ts", import.meta.url), "utf8");
  const member = readFileSync(new URL("../../app/api/account/addresses/[id]/route.ts", import.meta.url), "utf8");

  for (const source of [collection, member]) {
    assert.match(source, /import \{ parseAddress \} from "@\/lib\/account\/parse-address"/);
    assert.doesNotMatch(source, /from "@\/app\/api\/account\/addresses\/route"/);
  }

  assert.deepEqual(
    [...collection.matchAll(/export async function (\w+)/g)].map((match) => match[1]),
    ["GET", "POST"],
  );
  assert.deepEqual(
    [...member.matchAll(/export async function (\w+)/g)].map((match) => match[1]),
    ["PATCH", "DELETE"],
  );
  assert.doesNotMatch(collection, /export\s*\{[^}]*parseAddress/);
});

test("authorization and address ownership boundaries remain in both routes", () => {
  const collection = readFileSync(new URL("../../app/api/account/addresses/route.ts", import.meta.url), "utf8");
  const member = readFileSync(new URL("../../app/api/account/addresses/[id]/route.ts", import.meta.url), "utf8");

  assert.equal((collection.match(/await requireUser\(\)/g) ?? []).length, 2);
  assert.match(collection, /findMany\(\{ where: \{ userId: user\.id \}/);
  assert.match(collection, /create\(\{ data: \{ userId: user\.id, \.\.\.parseAddress/);
  assert.equal((member.match(/await requireUser\(\)/g) ?? []).length, 2);
  assert.match(member, /findFirst\(\{ where: \{ id, userId: user\.id \} \}\)/);
  assert.match(member, /deleteMany\(\{ where: \{ id, userId: user\.id \} \}\)/);
  assert.match(member, /status: 404/);
});
