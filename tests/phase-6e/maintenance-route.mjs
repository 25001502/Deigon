// Run: node --test tests/phase-6e/maintenance-route.mjs
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, beforeEach, test } from "node:test";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalSecret = process.env.DEIGON_MAINTENANCE_SECRET;
const originalTtl = process.env.UNPAID_ORDER_TTL_MINUTES;
const validSecret = "phase-6e-test-maintenance-secret-000000000000";
let app;
let calls;

function expire(options) {
  calls.push(options);
  return Promise.resolve({ examined: 4, expired: 1, skipped: 1, providerBacked: 1, blocked: 1 });
}

globalThis.__deigonPhase6eRoute = { expire };

const bundle = await build({
  stdin: {
    contents: `export { POST } from './app/api/internal/maintenance/expire-unpaid-orders/route';`,
    resolveDir: root,
    sourcefile: "phase-6e-maintenance-route.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  plugins: [{
    name: "phase6e-route-boundary",
    setup(builder) {
      builder.onResolve({ filter: /^(server-only|@\/lib\/orders\/expire-unpaid-orders)$/ }, ({ path: importPath }) => ({
        path: importPath,
        namespace: "test-boundary",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test-boundary" }, ({ path: importPath }) => ({
        contents: importPath === "server-only"
          ? ""
          : "export const expireUnpaidOrders = options => globalThis.__deigonPhase6eRoute.expire(options);",
      }));
    },
  }],
});

const loaded = new Module(path.join(root, "phase-6e-maintenance-route.cjs"));
loaded.filename = path.join(root, "phase-6e-maintenance-route.cjs");
loaded.paths = Module._nodeModulePaths(root);
loaded._compile(bundle.outputFiles[0].text, loaded.filename);
app = loaded.exports;

beforeEach(() => {
  calls = [];
  globalThis.__deigonPhase6eRoute.expire = expire;
  process.env.DEIGON_MAINTENANCE_SECRET = validSecret;
  process.env.UNPAID_ORDER_TTL_MINUTES = "60";
});

after(() => {
  if (originalSecret === undefined) delete process.env.DEIGON_MAINTENANCE_SECRET;
  else process.env.DEIGON_MAINTENANCE_SECRET = originalSecret;
  if (originalTtl === undefined) delete process.env.UNPAID_ORDER_TTL_MINUTES;
  else process.env.UNPAID_ORDER_TTL_MINUTES = originalTtl;
  delete globalThis.__deigonPhase6eRoute;
});

async function post(authorization, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  if (authorization !== undefined) headers.set("authorization", authorization);
  const response = await app.POST(new Request(
    "https://shop.example/api/internal/maintenance/expire-unpaid-orders",
    { method: "POST", headers },
  ));
  return { status: response.status, body: await response.json() };
}

test("missing or weak secret configuration returns 503 before maintenance work", async () => {
  for (const value of [undefined, "", "too-short"]) {
    if (value === undefined) delete process.env.DEIGON_MAINTENANCE_SECRET;
    else process.env.DEIGON_MAINTENANCE_SECRET = value;
    const result = await post(`Bearer ${validSecret}`);
    assert.deepEqual(result, {
      status: 503,
      body: { ok: false, message: "Maintenance is not configured." },
    });
  }
  assert.equal(calls.length, 0);
});

test("missing and incorrect authorization are rejected before maintenance work", async () => {
  const missing = await post(undefined, {
    cookie: "customer-supabase-session=not-maintenance-authorization",
    "x-user-id": "customer-id",
  });
  assert.deepEqual(missing, {
    status: 401,
    body: { ok: false, message: "Maintenance authorization required." },
  });

  for (const authorization of ["Basic credentials", "Bearer", "Bearer wrong-secret"]) {
    const result = await post(authorization);
    assert.ok([401, 403].includes(result.status));
    assert.ok(!JSON.stringify(result).includes(validSecret));
  }
  assert.equal(calls.length, 0);
});

test("invalid TTL configuration fails closed after valid maintenance authentication", async () => {
  for (const value of ["", "abc", "0", "4", "10081"]) {
    process.env.UNPAID_ORDER_TTL_MINUTES = value;
    const result = await post(`Bearer ${validSecret}`);
    assert.deepEqual(result, {
      status: 503,
      body: { ok: false, message: "Maintenance is not configured." },
    });
  }
  assert.equal(calls.length, 0);
});

test("correct bearer secret runs bounded maintenance and returns only safe counts", async () => {
  const result = await post(`Bearer ${validSecret}`, {
    cookie: "customer-supabase-session=irrelevant",
    "x-user-id": "irrelevant-customer",
  });
  assert.deepEqual(result, {
    status: 200,
    body: {
      ok: true,
      summary: { examined: 4, expired: 1, skipped: 1, providerBacked: 1, blocked: 1 },
    },
  });
  assert.deepEqual(calls, [{ ttlMinutes: 60 }]);
  assert.deepEqual(Object.keys(result.body.summary).sort(), [
    "blocked", "examined", "expired", "providerBacked", "skipped",
  ]);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(validSecret));
  assert.ok(!/orderId|customer|inventory|providerCheckoutId|transactionId/.test(serialized));
});

test("unexpected maintenance failures are controlled and do not expose secrets", async () => {
  globalThis.__deigonPhase6eRoute.expire = async () => {
    throw new Error(`PRIVATE ${validSecret} database failure`);
  };
  const result = await post(`Bearer ${validSecret}`);
  assert.deepEqual(result, {
    status: 503,
    body: { ok: false, message: "Maintenance is temporarily unavailable." },
  });
  assert.ok(!JSON.stringify(result).includes(validSecret));
});
