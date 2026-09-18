// Run: node --test tests/phase-6d/payment-return-status.mjs
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalFetch = globalThis.fetch;

const bundle = await build({
  stdin: {
    contents: `export * from './components/checkout/payment-return-status';`,
    resolveDir: root,
    sourcefile: "phase-6d-payment-return-status.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  plugins: [{
    name: "next-link-boundary",
    setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next/link", namespace: "test-ui" }));
      builder.onLoad({ filter: /.*/, namespace: "test-ui" }, () => ({
        contents: `import { createElement } from "react";
          export default function Link(props) { return createElement("a", props, props.children); }`,
        resolveDir: root,
      }));
    },
  }],
});

const loaded = new Module(path.join(root, "phase-6d-payment-return-status.cjs"));
loaded.filename = path.join(root, "phase-6d-payment-return-status.cjs");
loaded.paths = Module._nodeModulePaths(root);
loaded._compile(bundle.outputFiles[0].text, loaded.filename);

const {
  PAYMENT_POLL_DEADLINE_MS,
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_MAX_ATTEMPTS,
  PaymentStatusView,
  fetchPaymentStatus,
  isValidPaymentReturnOrderId,
  pollPaymentStatus,
} = loaded.exports;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function snapshot({
  orderStatus = "PENDING",
  orderPaymentStatus = "PENDING",
  paymentStatus = "PENDING",
} = {}) {
  return {
    order: {
      id: "order_test",
      orderNumber: "DGN-20260918-TEST",
      status: orderStatus,
      paymentStatus: orderPaymentStatus,
      fulfilmentType: "DELIVERY",
      total: "480.50",
      confirmedAt: paymentStatus === "PAID" ? "2026-09-18T10:00:00.000Z" : null,
    },
    payment: { provider: "YOCO", status: paymentStatus },
  };
}

function render(props) {
  return renderToStaticMarkup(createElement(PaymentStatusView, props));
}

test("authoritative paid state renders for confirmed and progressed paid orders", () => {
  for (const orderStatus of ["CONFIRMED", "PROCESSING", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED"]) {
    const html = render({
      kind: "success",
      snapshot: snapshot({ orderStatus, orderPaymentStatus: "PAID", paymentStatus: "PAID" }),
    });
    assert.match(html, /Payment confirmed/);
    assert.match(html, /DGN-20260918-TEST/);
    assert.match(html, /R 480.50/);
  }
});

test("pending success never claims payment confirmation", () => {
  const html = render({ kind: "success", snapshot: snapshot() });
  assert.match(html, /We&#x27;re confirming your payment/);
  assert.doesNotMatch(html, /Payment confirmed|Payment successful|Order paid/);
});

test("success polling handles the webhook race sequentially and stops once paid", async () => {
  const controller = new AbortController();
  const replies = [
    snapshot(),
    snapshot({ orderStatus: "CONFIRMED", orderPaymentStatus: "PAID", paymentStatus: "PAID" }),
  ];
  const seen = [];
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  let waitCount = 0;

  const result = await pollPaymentStatus({
    kind: "success",
    orderId: "order_test",
    signal: controller.signal,
    request: async () => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      const reply = replies.shift();
      activeRequests -= 1;
      return reply;
    },
    wait: async (milliseconds) => {
      assert.equal(milliseconds, PAYMENT_POLL_INTERVAL_MS);
      waitCount += 1;
    },
    onSnapshot: (value) => seen.push(value.payment.status),
  });

  assert.equal(result.state, "paid");
  assert.equal(result.timedOut, false);
  assert.deepEqual(seen, ["PENDING", "PAID"]);
  assert.equal(waitCount, 1);
  assert.equal(maximumActiveRequests, 1);
});

test("pending polling stops after the bounded window and renders the timeout message", async () => {
  const controller = new AbortController();
  let requestCount = 0;
  let waitCount = 0;

  const result = await pollPaymentStatus({
    kind: "success",
    orderId: "order_test",
    signal: controller.signal,
    request: async () => {
      requestCount += 1;
      return snapshot();
    },
    wait: async () => {
      waitCount += 1;
    },
  });

  assert.equal(requestCount, PAYMENT_POLL_MAX_ATTEMPTS);
  assert.equal(waitCount, PAYMENT_POLL_MAX_ATTEMPTS - 1);
  assert.equal(result.state, "pending");
  assert.equal(result.timedOut, true);
  assert.match(
    render({ kind: "success", snapshot: result.snapshot, timedOut: result.timedOut }),
    /Payment verification is taking longer than expected\./,
  );
});

test("the hard deadline aborts a hanging request after a prior pending snapshot", async () => {
  const controller = new AbortController();
  let deadlineCallback;
  let requestCount = 0;
  let inFlightAborted = false;
  let deadlineCancelled = false;

  const result = await pollPaymentStatus({
    kind: "success",
    orderId: "order_test",
    signal: controller.signal,
    request: async (_orderId, requestSignal) => {
      requestCount += 1;
      if (requestCount === 1) return snapshot();

      return new Promise((_resolve, reject) => {
        requestSignal.addEventListener("abort", () => {
          inFlightAborted = true;
          reject(new DOMException("deadline", "AbortError"));
        }, { once: true });
        deadlineCallback();
      });
    },
    wait: async () => {},
    scheduleDeadline: (callback, milliseconds) => {
      assert.equal(milliseconds, PAYMENT_POLL_DEADLINE_MS);
      deadlineCallback = callback;
      return () => {
        deadlineCancelled = true;
      };
    },
  });

  assert.equal(requestCount, 2);
  assert.equal(inFlightAborted, true);
  assert.equal(deadlineCancelled, true);
  assert.equal(result.state, "pending");
  assert.equal(result.timedOut, true);
  assert.match(
    render({ kind: "success", snapshot: result.snapshot, timedOut: result.timedOut }),
    /Payment verification is taking longer than expected\./,
  );
});

test("a deadline with no valid snapshot settles as unavailable", async () => {
  let deadlineCallback;
  let inFlightAborted = false;

  const result = await pollPaymentStatus({
    kind: "success",
    orderId: "order_test",
    signal: new AbortController().signal,
    request: async (_orderId, requestSignal) => new Promise((_resolve, reject) => {
      requestSignal.addEventListener("abort", () => {
        inFlightAborted = true;
        reject(new DOMException("deadline", "AbortError"));
      }, { once: true });
      deadlineCallback();
    }),
    scheduleDeadline: (callback) => {
      deadlineCallback = callback;
      return () => {};
    },
  });

  assert.equal(inFlightAborted, true);
  assert.equal(result.snapshot, null);
  assert.equal(result.state, "unavailable");
  assert.equal(result.timedOut, false);
});

test("cancel and failure read pending state once without claiming failure or cancellation", async () => {
  for (const kind of ["cancel", "failure"]) {
    let requestCount = 0;
    const result = await pollPaymentStatus({
      kind,
      orderId: "order_test",
      signal: new AbortController().signal,
      request: async () => {
        requestCount += 1;
        return snapshot();
      },
      wait: async () => assert.fail("cancel and failure views must not poll"),
    });

    assert.equal(requestCount, 1);
    assert.equal(result.state, "pending");
    const html = render({ kind, snapshot: result.snapshot });
    assert.match(html, /Payment has not been confirmed/);
    assert.doesNotMatch(html, /Payment failed|Order cancelled|Payment confirmed/);
  }
});

test("cancel and failure still render authoritative paid state", () => {
  const paid = snapshot({ orderStatus: "PROCESSING", orderPaymentStatus: "PAID", paymentStatus: "PAID" });
  for (const kind of ["cancel", "failure"]) {
    assert.match(render({ kind, snapshot: paid }), /Payment confirmed/);
  }
});

test("missing, malformed and inaccessible orders use the same generic UI", () => {
  for (const orderId of [null, "", "short", "<script>", "a".repeat(129)]) {
    assert.equal(isValidPaymentReturnOrderId(orderId), false);
  }
  assert.equal(isValidPaymentReturnOrderId("cmg_server_order_123"), true);

  const unavailable = render({ kind: "success", snapshot: null, unavailable: true });
  const inconsistent = render({
    kind: "success",
    snapshot: snapshot({ orderPaymentStatus: "PAID", paymentStatus: "PENDING" }),
  });
  assert.match(unavailable, /We couldn&#x27;t verify the current payment state/);
  assert.match(inconsistent, /We couldn&#x27;t verify the current payment state/);
  assert.doesNotMatch(unavailable, /DGN-|transaction|checkout/i);
});

test("status fetch is a same-origin GET and sends no mutation body", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ok: true, ...snapshot() });
  };

  const result = await fetchPaymentStatus("order_test", new AbortController().signal);
  assert.ok(result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/orders/order_test/payment-status");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal("body" in calls[0].options, false);
});

test("component unmount abort remains distinct from a deadline timeout", async () => {
  const controller = new AbortController();
  let requestCount = 0;
  let inFlightAborted = false;
  const result = await pollPaymentStatus({
    kind: "success",
    orderId: "order_test",
    signal: controller.signal,
    request: async (_orderId, requestSignal) => {
      requestCount += 1;
      return new Promise((_resolve, reject) => {
        requestSignal.addEventListener("abort", () => {
          inFlightAborted = true;
          reject(new DOMException("unmounted", "AbortError"));
        }, { once: true });
        controller.abort();
      });
    },
    scheduleDeadline: () => () => {},
  });

  assert.equal(result.state, "aborted");
  assert.equal(result.timedOut, false);
  assert.equal(requestCount, 1);
  assert.equal(inFlightAborted, true);
});
