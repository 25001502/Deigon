import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the storefront root clips only horizontally so the sticky header follows viewport scrolling", () => {
  const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
  const header = readFileSync(path.join(root, "components/storefront/header.tsx"), "utf8");

  assert.match(layout, /className="relative min-h-screen overflow-x-clip"/);
  assert.doesNotMatch(layout, /className="relative min-h-screen overflow-hidden"/);
  assert.match(header, /className="sticky top-0 z-40"/);
  assert.doesNotMatch(header, /className="fixed/);
});
