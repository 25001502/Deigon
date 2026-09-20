import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";
import { bundle } from "./support/bundle.mjs";

let exchanged;
let authError;
const app = await bundle(`
  export { GET } from './app/auth/callback/route';
  export { safeCallbackPath } from './lib/auth/safe-callback-path';
`, {
  "@supabase/ssr": `export const createServerClient = (_url, _key, options) => ({ auth: {
    exchangeCodeForSession: async code => {
      options.cookies.setAll([{ name: 'test-session', value: 'test-cookie', options: { httpOnly: true, path: '/' } }]);
      return globalThis.__adminCallback(code);
    }
  } });`,
});

beforeEach(() => {
  exchanged = []; authError = null;
  globalThis.__adminCallback = async code => { exchanged.push(code); return { error: authError }; };
});
afterEach(() => { delete globalThis.__adminCallback; });

function request(next, code = "valid-code") {
  const url = new URL("https://shop.example/auth/callback");
  if (code !== null) url.searchParams.set("code", code);
  if (next !== null) url.searchParams.set("next", next);
  return new NextRequest(url);
}

for (const next of ["/account", "/admin/orders", "/collections/all?page=2#products", "/products/a%20b", "/account?tab=security", "/"]) {
  test(`callback preserves safe internal destination ${next} and session cookie`, async () => {
    const response = await app.GET(request(next));
    assert.equal(response.headers.get("location"), new URL(next, "https://shop.example").href);
    assert.match(response.headers.get("set-cookie"), /test-session=test-cookie/);
    assert.deepEqual(exchanged, ["valid-code"]);
  });
}

for (const next of [null, "", "https://evil.example", "http://evil.example", "//evil.example", "javascript:alert(1)", "account", "/\\evil.example", "/%5cevil.example", "/%2fevil.example", "/%0a/evil.example", "/bad%zz", "/bad%E0%A4%A", "/account\n", " /account", "/..//evil.example"]) {
  test(`callback rejects unsafe/malformed destination ${JSON.stringify(next)}`, async () => {
    const response = await app.GET(request(next));
    assert.equal(response.headers.get("location"), "https://shop.example/account");
  });
}

test("missing confirmation code does not exchange a session", async () => {
  const response = await app.GET(request("/admin", null));
  assert.match(response.headers.get("location"), /^https:\/\/shop.example\/login\?error=/);
  assert.deepEqual(exchanged, []);
});

test("failed exchange retains the existing login error flow", async () => {
  authError = { message: "Invalid confirmation" };
  const response = await app.GET(request("/account"));
  assert.equal(response.headers.get("location"), "https://shop.example/login?error=Invalid%20confirmation");
});
