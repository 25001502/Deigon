import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const adminRoots = ["app/admin", "components/admin"];
const chromaticUtility = /(?:^|[\s"'`])(?:[a-z-]+:)*(?:bg|text|border|ring|outline|divide|from|via|to|accent|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|stone|slate|zinc|gray|ink|forest|clay|brass|sand|paper)(?:-|\/|\b)/g;

function sourceFiles(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(?:css|tsx?|jsx?)$/.test(entry.name) ? [relative] : [];
  });
}

const files = adminRoots.flatMap(sourceFiles);

test("all admin-owned UI source uses only the approved neutral palette", () => {
  const findings = [];
  for (const file of files) {
    const source = readFileSync(path.join(root, file), "utf8");
    for (const match of source.matchAll(chromaticUtility)) findings.push(`${file}: ${match[0].trim()}`);
  }
  assert.deepEqual(findings, []);
});

test("admin CSS is route-scoped and every literal color is grayscale", () => {
  const css = readFileSync(path.join(root, "app/admin/admin.css"), "utf8");
  assert.doesNotMatch(css, /--color-(?:forest|clay|paper|brass|sand|ink)\s*:/);
  assert.doesNotMatch(css, /(?:^|})\s*(?::root|html|body)\s*\{/m);
  assert.match(css, /body:has\(\.admin-theme\)/);
  assert.match(css, /\.admin-theme[^{}]*:focus-visible/);
  assert.match(css, /outline:\s*2px solid/);

  const colors = [...css.matchAll(/#([\da-f]{6})/gi)].map((match) => match[1]);
  assert.ok(colors.length > 0);
  for (const hex of colors) {
    assert.equal(hex.slice(0, 2), hex.slice(2, 4), `red and green differ in #${hex}`);
    assert.equal(hex.slice(2, 4), hex.slice(4, 6), `green and blue differ in #${hex}`);
  }
});

test("the admin layout owns the theme boundary without changing the root layout", () => {
  const layout = readFileSync(path.join(root, "app/admin/layout.tsx"), "utf8");
  assert.match(layout, /import "\.\/admin\.css"/);
  assert.match(layout, /className="admin-theme min-h-screen bg-neutral-50 text-neutral-950"/);

  const rootLayout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
  assert.doesNotMatch(rootLayout, /admin-theme|admin\.css/);
});

test("status badges preserve non-color distinctions while product imagery retains color", () => {
  for (const file of [
    "components/admin/dashboard/admin-dashboard.tsx",
    "components/admin/orders/admin-orders-list.tsx",
    "components/admin/orders/admin-order-detail.tsx",
  ]) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.match(source, /border-solid/);
    assert.match(source, /border-double/);
    assert.match(source, /border-dashed/);
  }

  const products = readFileSync(path.join(root, "components/admin/products/admin-products-list.tsx"), "utf8");
  const orders = readFileSync(path.join(root, "components/admin/orders/admin-order-detail.tsx"), "utf8");
  for (const source of [products, orders]) {
    assert.doesNotMatch(source, /<img[^>]*className="[^"]*\b(?:grayscale|saturate-0|filter)\b/);
    assert.match(source, /<img[^>]*className="h-full w-full object-cover"/);
  }
});

test("dashboard text on black surfaces keeps accessible light-neutral contrast", () => {
  const dashboard = readFileSync(path.join(root, "components/admin/dashboard/admin-dashboard.tsx"), "utf8");
  assert.match(dashboard, /text-neutral-300">Business overview<\/p>/);
  assert.doesNotMatch(dashboard, /text-neutral-600">Business overview<\/p>/);
  assert.match(dashboard, /bg-white\/10 p-2 text-neutral-300/);
});

test("core foreground/background pairs meet WCAG AA contrast", () => {
  function luminance(hex) {
    const channels = hex.match(/[\da-f]{2}/gi).map((value) => {
      const channel = Number.parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
  }
  function contrast(foreground, background) {
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  }

  assert.ok(contrast("525252", "ffffff") >= 4.5, "secondary text on white");
  assert.ok(contrast("525252", "fafafa") >= 4.5, "secondary text on neutral-50");
  assert.ok(contrast("171717", "e5e5e5") >= 4.5, "badge text on neutral-200");
  assert.ok(contrast("ffffff", "000000") >= 4.5, "primary button text");
  assert.ok(contrast("d4d4d4", "000000") >= 4.5, "dashboard eyebrow on black");
});
