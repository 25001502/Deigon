import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bundle, root } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './components/admin/products/sale/sale-ui';
  export * from './components/admin/products/sale/sale-api';
  export { AdminSalePricing, SalePricingForm } from './components/admin/products/sale/admin-sale-pricing';
  export { variantPayload } from './components/admin/products/product-ui';
`, {
  "next/link": `export default function Link({ children, prefetch: _prefetch, ...props }) { return <a {...props}>{children}</a>; }`,
});

function sale(overrides = {}) {
  return {
    productId: "product_f4",
    variantId: "variant_f4",
    sku: "TEE-BLK-M",
    size: "M",
    color: "Black",
    normalPrice: "1499.00",
    salePrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
    effectivePrice: "1499.00",
    isOnSale: false,
    state: "NONE",
    productUpdatedAt: "2026-09-27T11:00:00.000Z",
    ...overrides,
  };
}

function response(status, payload = { ok: false }) {
  return Promise.resolve(new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

function renderForm(dto, pending = false) {
  return renderToStaticMarkup(React.createElement(app.SalePricingForm, {
    editor: app.createSaleEditorState(dto),
    errors: {},
    pending,
    onChange() {},
    onSave() {},
    onRemove() {},
    onReload() {},
  }));
}

test("every existing Admin D variant exposes its dedicated Manage sale route", () => {
  const source = readFileSync(`${root}/components/admin/products/admin-product-form.tsx`, "utf8");
  assert.match(source, /product\.variants\.map\(\(variant\)/);
  assert.match(source, /variants\/\$\{encodeURIComponent\(variant\.id\)\}\/sale/);
  assert.match(source, />Manage sale</);
  assert.deepEqual(app.variantPayload({ sku: "TEE-M", size: "M", color: "Black", price: "899.00" }), {
    sku: "TEE-M", size: "M", color: "Black", price: "899.00",
  });
});

test("sale page has its own server guard and passes only route IDs to the client", async () => {
  let guards = 0;
  globalThis.__adminF4Guard = () => { guards++ };
  const page = await bundle(`export { default as page } from './app/admin/(protected)/products/[productId]/variants/[variantId]/sale/page';`, {
    "@/lib/auth/require-admin-page": `export async function requireAdminPage() { globalThis.__adminF4Guard(); }`,
    "@/components/admin/products/sale/admin-sale-pricing": `export function AdminSalePricing(props) { return <div data-product={props.productId} data-variant={props.variantId} />; }`,
  });
  const element = await page.page({ params: Promise.resolve({ productId: "product_f4", variantId: "variant_f4" }) });
  assert.equal(guards, 1);
  assert.equal(element.props.productId, "product_f4");
  assert.equal(element.props.variantId, "variant_f4");
  delete globalThis.__adminF4Guard;
  const clientSource = readFileSync(`${root}/components/admin/products/sale/admin-sale-pricing.tsx`, "utf8");
  assert.doesNotMatch(clientSource, /@\/lib\/prisma|PrismaClient|\.productVariant\./);
});

test("initial render is an accessible loading state", () => {
  const html = renderToStaticMarkup(React.createElement(app.AdminSalePricing, { productId: "product_f4", variantId: "variant_f4" }));
  assert.match(html, /role="status"/);
  assert.match(html, /Loading sale pricing/);
});

test("protected GET uses the exact variant endpoint and no-store credentials", async () => {
  const calls = [];
  const result = await app.fetchVariantSale("product/id", "variant/id", async (url, init) => {
    calls.push([url, init]);
    return response(200, { ok: true, data: sale() });
  });
  assert.equal(result.kind, "ok");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/admin/products/product%2Fid/variants/variant%2Fid/sale");
  assert.equal(calls[0][1].cache, "no-store");
  assert.equal(calls[0][1].credentials, "same-origin");
  assert.equal(calls[0][1].method, undefined);
});

test("GET response hydrates sale price and SAST form fields", () => {
  const state = app.createSaleEditorState(sale({
    salePrice: "1199.95",
    saleStartsAt: "2026-09-27T10:00:00.000Z",
    saleEndsAt: "2026-09-30T20:30:15.250Z",
  }));
  assert.deepEqual(state.draft, {
    salePrice: "1199.95",
    saleStartsAt: "2026-09-27T12:00:00.000",
    saleEndsAt: "2026-09-30T22:30:15.250",
  });
  assert.equal(state.sale.productUpdatedAt, "2026-09-27T11:00:00.000Z");
});

for (const [state, label, effectivePrice] of [
  ["NONE", "No sale", "1499.00"],
  ["SCHEDULED", "Scheduled", "1499.00"],
  ["ACTIVE", "Active", "1199.95"],
  ["EXPIRED", "Expired", "1499.00"],
]) test(`${state} renders explicit state and exact normal/effective money`, () => {
  const html = renderForm(sale({ state, effectivePrice, salePrice: state === "NONE" ? null : "1199.95", isOnSale: state === "ACTIVE" }));
  assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /R1,499\.00/);
  assert.match(html, new RegExp(effectivePrice === "1199.95" ? "R1,199\\.95" : "R1,499\\.00"));
});

test("admin money and discount preview preserve cents using integer arithmetic", () => {
  assert.equal(app.formatAdminMoney("1199.95"), "R1,199.95");
  assert.equal(app.formatAdminMoney("1499.00"), "R1,499.00");
  assert.deepEqual(app.discountPreview("1500.00", "1200.00"), { percent: 20, saving: "R300.00" });
  assert.deepEqual(app.discountPreview("1499.00", "1199.95"), { percent: 20, saving: "R299.05" });
});

test("UTC and SAST conversion is explicit and independent of browser timezone", () => {
  assert.equal(app.isoToSastInput("2026-09-27T10:00:00.000Z"), "2026-09-27T12:00:00.000");
  assert.equal(app.sastInputToOffset("2026-09-27T12:00:00.000"), "2026-09-27T12:00:00.000+02:00");
  assert.equal(
    new Date(app.sastInputToOffset(app.isoToSastInput("2026-09-27T10:00:00.000Z"))).toISOString(),
    "2026-09-27T10:00:00.000Z",
  );
});

test("sale payloads support indefinite, start-only, end-only and bounded schedules", async () => {
  const dto = sale();
  const drafts = [
    { salePrice: "1199", saleStartsAt: "", saleEndsAt: "" },
    { salePrice: "1199.9", saleStartsAt: "2026-09-27T12:00", saleEndsAt: "" },
    { salePrice: "1199.95", saleStartsAt: "", saleEndsAt: "2026-09-30T23:59:59.999" },
    { salePrice: "1199.95", saleStartsAt: "2026-09-27T12:00:00.000", saleEndsAt: "2026-09-30T23:59:59.999" },
  ];
  const calls = [];
  for (const draft of drafts) {
    assert.deepEqual(app.validateSaleDraft(draft, dto.normalPrice), {});
    const body = app.saleMutationPayload(dto, draft);
    await app.updateVariantSale(dto.productId, dto.variantId, body, async (url, init) => {
      calls.push([url, init]);
      return response(200, { ok: true, data: dto });
    });
  }
  assert.equal(calls.length, 4);
  for (const [, init] of calls) {
    const body = JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(), ["expectedUpdatedAt", "salePrice", "saleStartsAt", "saleEndsAt"].sort());
    for (const forbidden of ["discountPercent", "effectivePrice", "normalPrice", "state", "isOnSale"]) assert.equal(forbidden in body, false);
  }
  assert.deepEqual(JSON.parse(calls[0][1].body), { expectedUpdatedAt: dto.productUpdatedAt, salePrice: "1199", saleStartsAt: null, saleEndsAt: null });
  assert.equal(JSON.parse(calls[1][1].body).saleStartsAt, "2026-09-27T12:00:00.000+02:00");
  assert.equal(JSON.parse(calls[2][1].body).saleEndsAt, "2026-09-30T23:59:59.999+02:00");
});

test("successful response replaces the form and supplies the next mutation token", () => {
  const initial = app.createSaleEditorState(sale());
  const changed = app.saleEditorReducer(initial, { type: "change", draft: { salePrice: "1000", saleStartsAt: "", saleEndsAt: "" } });
  const canonical = sale({ salePrice: "1000.00", effectivePrice: "1000.00", isOnSale: true, state: "ACTIVE", productUpdatedAt: "2026-09-27T11:00:00.001Z" });
  const next = app.saleEditorReducer(changed, { type: "canonical", sale: canonical, message: "Sale pricing saved." });
  assert.equal(next.sale.productUpdatedAt, "2026-09-27T11:00:00.001Z");
  assert.equal(next.draft.salePrice, "1000.00");
  assert.equal(next.message.text, "Sale pricing saved.");
});

test("Remove sale sends only null sale fields and leaves normal price out of the mutation", async () => {
  const dto = sale({ salePrice: "1199.95", state: "ACTIVE", effectivePrice: "1199.95", isOnSale: true });
  const body = app.clearSalePayload(dto);
  const calls = [];
  await app.updateVariantSale(dto.productId, dto.variantId, body, async (url, init) => {
    calls.push([url, init]);
    return response(200, { ok: true, data: sale() });
  });
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    expectedUpdatedAt: dto.productUpdatedAt,
    salePrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
  });
  assert.equal("normalPrice" in JSON.parse(calls[0][1].body), false);
});

test("local validation reports malformed money and end-before-start", () => {
  assert.match(app.validateSaleDraft({ salePrice: "1.999", saleStartsAt: "", saleEndsAt: "" }, "1499.00").salePrice, /two decimal/);
  assert.match(app.validateSaleDraft({ salePrice: "1000", saleStartsAt: "2026-09-28T12:00", saleEndsAt: "2026-09-27T12:00" }, "1499.00").saleEndsAt, /later than start/);
});

test("API errors are categorized safely and only controlled 400/409 messages are retained", async () => {
  const dto = sale();
  const body = app.clearSalePayload(dto);
  assert.deepEqual(await app.updateVariantSale(dto.productId, dto.variantId, body, () => response(400, { message: "Review the sale fields." })), { kind: "invalid", message: "Review the sale fields." });
  assert.deepEqual(await app.updateVariantSale(dto.productId, dto.variantId, body, () => response(409, { message: "Product changed." })), { kind: "conflict", message: "Product changed." });
  assert.deepEqual(await app.updateVariantSale(dto.productId, dto.variantId, body, () => response(500, { message: "postgres://private" })), { kind: "error" });
});

for (const [status, kind] of [[401, "unauthenticated"], [403, "forbidden"], [404, "not-found"]]) {
  test(`${status} sale API response becomes a safe ${kind} state`, async () => {
    const result = await app.fetchVariantSale("product_f4", "variant_f4", () => response(status, { message: "private detail" }));
    assert.deepEqual(result, { kind });
    assert.doesNotMatch(JSON.stringify(result), /private detail/);
  });
}

test("409 preserves the draft until an explicit canonical reload replaces it", () => {
  const initial = app.createSaleEditorState(sale({ salePrice: "1200.00" }));
  const draft = { salePrice: "999.95", saleStartsAt: "2026-09-27T12:00", saleEndsAt: "" };
  const changed = app.saleEditorReducer(initial, { type: "change", draft });
  const conflicted = app.saleEditorReducer(changed, { type: "conflict", message: "Product changed." });
  assert.deepEqual(conflicted.draft, draft);
  assert.equal(conflicted.conflict, true);
  const latest = sale({ salePrice: "1100.00", productUpdatedAt: "2026-09-27T11:00:00.002Z" });
  const reloaded = app.saleEditorReducer(conflicted, { type: "canonical", sale: latest });
  assert.equal(reloaded.draft.salePrice, "1100.00");
  assert.equal(reloaded.sale.productUpdatedAt, latest.productUpdatedAt);
  assert.equal(reloaded.conflict, false);
});

test("pending UI blocks duplicate Save and Remove submission", () => {
  const html = renderForm(sale({ salePrice: "1199.95" }), true);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""[^>]*>Saving\.\.\.<\/button>/);
  assert.match(html, /disabled=""[^>]*>Saving sale\.\.\.<\/button>/);
  const source = readFileSync(`${root}/components/admin/products/sale/admin-sale-pricing.tsx`, "utf8");
  assert.match(source, /submitting\.current/);
});

test("F4 stays out of public commerce and adds no polling or automatic timers", () => {
  const source = [
    "components/admin/products/sale/admin-sale-pricing.tsx",
    "components/admin/products/sale/sale-api.ts",
    "components/admin/products/sale/sale-ui.ts",
  ].map((file) => readFileSync(`${root}/${file}`, "utf8")).join("\n");
  assert.doesNotMatch(source, /lib\/api\/serialize-product|lib\/cart|lib\/checkout|Yoco|Payment|OrderItem|Inventory/);
  assert.doesNotMatch(source, /setInterval|setTimeout|WebSocket/);
  assert.match(source, /sm:grid-cols-2|sm:flex-row/);
});
