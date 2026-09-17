// Run: node --test tests/phase-6c/yoco-webhook-verifier.mjs
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalSecret = process.env.YOCO_WEBHOOK_SECRET;
const secretBytes = Buffer.from("phase-6c-fake-webhook-secret");
const secret = `whsec_${secretBytes.toString("base64")}`;
const webhookId = "evt_phase6c_test";
const timestamp = () => String(Math.floor(Date.now() / 1000));

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["lib/payments/yoco-webhook.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  plugins: [{
    name: "server-only-test-marker",
    setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({
        path: "server-only", namespace: "test-marker",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test-marker" }, () => ({ contents: "" }));
    },
  }],
});
const loaded = new Module(path.join(root, "phase-6c-verifier.cjs"));
loaded.filename = path.join(root, "phase-6c-verifier.cjs");
loaded.paths = Module._nodeModulePaths(root);
loaded._compile(bundle.outputFiles[0].text, loaded.filename);
const { verifyYocoWebhook, YocoWebhookVerificationError } = loaded.exports;

before(() => { process.env.YOCO_WEBHOOK_SECRET = secret; });
after(() => {
  if (originalSecret === undefined) delete process.env.YOCO_WEBHOOK_SECRET;
  else process.env.YOCO_WEBHOOK_SECRET = originalSecret;
});

function signature(rawBody, sentAt, key = secretBytes) {
  return createHmac("sha256", key)
    .update(`${webhookId}.${sentAt}.${rawBody}`, "utf8")
    .digest("base64");
}

function input(rawBody, overrides = {}) {
  const sentAt = overrides.webhookTimestamp ?? timestamp();
  return {
    rawBody,
    webhookId,
    webhookTimestamp: sentAt,
    webhookSignature: `v1,${signature(rawBody, sentAt)}`,
    ...overrides,
  };
}

function verificationError(code) {
  return (error) => {
    assert.ok(error instanceof YocoWebhookVerificationError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(!String(error.stack).includes(secret));
    return true;
  };
}

test("accepts a valid v1 signature and parses JSON only after verification", () => {
  const rawBody = '{"id":"evt_1","type":"payment.succeeded"}';
  assert.deepEqual(verifyYocoWebhook(input(rawBody)), {
    id: "evt_1", type: "payment.succeeded",
  });
});

test("raw body changes and equivalent JSON reformatting invalidate the signature", () => {
  const rawBody = '{"id":"evt_1","type":"payment.succeeded"}';
  const signed = input(rawBody);
  assert.throws(
    () => verifyYocoWebhook({ ...signed, rawBody: rawBody.replace("evt_1", "evt_2") }),
    verificationError("INVALID_WEBHOOK"),
  );
  assert.throws(
    () => verifyYocoWebhook({ ...signed, rawBody: '{ "id": "evt_1", "type": "payment.succeeded" }' }),
    verificationError("INVALID_WEBHOOK"),
  );
});

test("requires all verification headers and rejects malformed values", () => {
  const rawBody = "{}";
  const valid = input(rawBody);
  for (const overrides of [
    { webhookId: null }, { webhookId: "" }, { webhookId: "x".repeat(256) },
    { webhookTimestamp: null }, { webhookTimestamp: "" },
    { webhookSignature: null }, { webhookSignature: "" },
    { webhookSignature: "v1" }, { webhookSignature: "v1," },
    { webhookSignature: "v1,%%%" }, { webhookSignature: "v1,AAAA  broken" },
    { webhookSignature: "v1,AAAA  v1,BBBB" },
  ]) {
    assert.throws(
      () => verifyYocoWebhook({ ...valid, ...overrides }),
      verificationError("INVALID_WEBHOOK"),
    );
  }
});

test("accepts any matching v1 among multiple versions and signatures", () => {
  const rawBody = "{}";
  const sentAt = timestamp();
  const correct = signature(rawBody, sentAt);
  const wrong = randomBytes(32).toString("base64");
  const verified = verifyYocoWebhook(input(rawBody, {
    webhookTimestamp: sentAt,
    webhookSignature: `v2,${wrong} v1,${wrong} v1,${correct}`,
  }));
  assert.deepEqual(verified, {});
});

test("unsupported-only and non-matching v1 signatures fail", () => {
  const rawBody = "{}";
  const sentAt = timestamp();
  const wrong = randomBytes(32).toString("base64");
  for (const webhookSignature of [`v2,${signature(rawBody, sentAt)}`, `v1,${wrong}`]) {
    assert.throws(
      () => verifyYocoWebhook(input(rawBody, { webhookTimestamp: sentAt, webhookSignature })),
      verificationError("INVALID_WEBHOOK"),
    );
  }
});

test("different signature lengths fail safely without timingSafeEqual throwing", () => {
  const rawBody = "{}";
  const sentAt = timestamp();
  for (const bytes of [Buffer.from([1]), randomBytes(31), randomBytes(33), randomBytes(64)]) {
    assert.throws(
      () => verifyYocoWebhook(input(rawBody, {
        webhookTimestamp: sentAt,
        webhookSignature: `v1,${bytes.toString("base64")}`,
      })),
      verificationError("INVALID_WEBHOOK"),
    );
  }
});

test("enforces the inclusive 180-second timestamp window in both directions", () => {
  const rawBody = "{}";
  const now = Math.floor(Date.now() / 1000);
  for (const seconds of [now, now - 180, now + 180]) {
    const sentAt = String(seconds);
    assert.deepEqual(verifyYocoWebhook(input(rawBody, { webhookTimestamp: sentAt })), {});
  }
  for (const value of [
    String(now - 181), String(now + 181), "", "abc", "1.5", "-1", "+1",
    "01", "9007199254740992",
  ]) {
    assert.throws(
      () => verifyYocoWebhook(input(rawBody, { webhookTimestamp: value })),
      verificationError("INVALID_WEBHOOK"),
    );
  }
});

test("rejects a signature made with the wrong secret", () => {
  const rawBody = "{}";
  const sentAt = timestamp();
  assert.throws(
    () => verifyYocoWebhook(input(rawBody, {
      webhookTimestamp: sentAt,
      webhookSignature: `v1,${signature(rawBody, sentAt, randomBytes(32))}`,
    })),
    verificationError("INVALID_WEBHOOK"),
  );
});

test("rejects missing or malformed webhook configuration without exposing it", () => {
  const rawBody = "{}";
  for (const value of [undefined, "", "secret", "whsec_", "whsec_%%%", "whsec_AAAA==="]) {
    if (value === undefined) delete process.env.YOCO_WEBHOOK_SECRET;
    else process.env.YOCO_WEBHOOK_SECRET = value;
    assert.throws(
      () => verifyYocoWebhook(input(rawBody)),
      verificationError("CONFIGURATION"),
    );
  }
  process.env.YOCO_WEBHOOK_SECRET = secret;
});

test("only reports malformed JSON after its signature is valid", () => {
  const rawBody = '{"id":';
  assert.throws(
    () => verifyYocoWebhook(input(rawBody)),
    verificationError("INVALID_PAYLOAD"),
  );
  assert.throws(
    () => verifyYocoWebhook({ ...input(rawBody), webhookSignature: `v1,${randomBytes(32).toString("base64")}` }),
    verificationError("INVALID_WEBHOOK"),
  );
});

test("rejects oversized signed bodies", () => {
  const rawBody = JSON.stringify({ value: "x".repeat(256 * 1024) });
  assert.throws(
    () => verifyYocoWebhook(input(rawBody)),
    verificationError("INVALID_WEBHOOK"),
  );
});
