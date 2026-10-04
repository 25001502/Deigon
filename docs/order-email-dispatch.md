# Order email dispatch operations

DEIGON creates order-email events durably in `OrderEmailOutbox` in the same database transaction as the authoritative payment or fulfilment change. The production flow is:

1. A Yoco webhook or an admin fulfilment transition commits the business change and its transactional outbox event.
2. A best-effort Next.js `after()` callback asks the shared dispatcher to process one event without delaying the response.
3. An external scheduler calls `POST /api/internal/scheduler/send-order-emails` every minute to recover missed callbacks and wake the durable worker with a two-event dispatch limit.
4. The durable dispatcher claims, renders, and sends each event through Resend.

The production scheduler must support a one-minute cadence and send an HTTPS `POST` request to `https://www.deigon.co.za/api/internal/scheduler/send-order-emails` with the custom header `Authorization: Bearer <DEIGON_ORDER_EMAIL_SCHEDULER_SECRET>`. Store the scheduler-specific secret in the scheduler's protected secret or header configuration; never place it in the URL or query parameters. The route dispatches at most two sequential events so their ten-second provider timeouts leave margin inside the scheduler's 30-second request window. Monitor repeated failures with alerts. The external service is an operational dependency, not a guarantee of uninterrupted uptime.

`POST /api/internal/maintenance/send-order-emails` remains available for controlled manual maintenance. It continues to use `DEIGON_MAINTENANCE_SECRET` and the dispatcher's existing default limit.

## Secret boundaries

- `DEIGON_ORDER_EMAIL_SCHEDULER_SECRET` authorizes only the recurring scheduler POST route.
- `DEIGON_MAINTENANCE_SECRET` authorizes only the existing maintenance POST routes.
- `RESEND_API_KEY` is read only by the Resend provider adapter.

The secrets are separate trust domains with no fallback between them. Internal endpoints accept only their respective bearer header. They do not accept a query-string secret, cookies, or a user session as a substitute.

## Delivery and recovery guarantees

Delivery uses at-least-once dispatch processing with strong duplicate suppression: the database event is unique per order and lifecycle event, every worker owns a time-bounded claim token, and every attempt for one outbox row reuses `deigon/order-email/v1/<outbox-id>` as its Resend idempotency key. This is not a claim of mathematically exactly-once distributed delivery.

The dispatcher claims one due row at a time in a short PostgreSQL transaction using `FOR UPDATE SKIP LOCKED`. For one order, an existing earlier lifecycle event in `PENDING` or `SENDING` blocks later events until the earlier event reaches terminal `SENT` or `DEAD`; unrelated orders remain independently claimable. It commits the `SENDING` claim before any provider work. On the first claim, it validates the immutable snapshot, renders the exact subject, HTML, and text once, and persists all three through the active claim token before contacting Resend. Retries and stale recovery reuse that stored content byte-for-byte even if application URL configuration or template code changes. The recipient continues to come from the immutable outbox recipient, and the trusted sender remains fixed in the provider adapter.

The provider call remains outside a database transaction. Finalization runs in a separate guarded transaction that matches the row ID, `SENDING` status, and claim token. If the claim is lost before rendered content is persisted, no provider request is made. The provider timeout is ten seconds and the claim lease is ten minutes.

Retryable attempts use 1 minute, 5 minutes, 15 minutes, 1 hour, 3 hours, 6 hours, and 12 hours before the eighth attempt becomes `DEAD`. A valid provider Retry-After can lengthen that delay. Provider-account configuration failures restore the claimed attempt, postpone the row for one hour, and stop the run so the same outage does not consume customer delivery budgets. Invalid historical recipients, invalid snapshots, unsupported templates, impossible event/snapshot combinations, recipient mismatches, permanent provider rejection, and provider idempotency conflicts are dead-lettered with safe operational codes.

A stale `SENDING` row below the attempt ceiling may be reclaimed with a new token. A late worker cannot overwrite the newer worker because finalization is token-guarded. If a worker crashes after the provider accepted a message but before `SENT` was committed, the recovery attempt sends the same recipient and deterministic content with the same provider idempotency key. A stale row already at eight attempts is instead moved to `DEAD` with `stale_claim_after_max_attempts`; the last provider outcome is inherently ambiguous, and stopping avoids unbounded duplicate risk.

An immediate `after()` dispatch that creates a `DEAD` event emits a generic aggregate-only operational error. The recurring scheduler returns a stable non-success response with aggregate counts when its invocation creates any `DEAD` events, allowing scheduler failure notifications to alert operators. Retryable outcomes remain successful scheduler invocations, and returning a non-success response never requeues an already terminal event. Logs and route responses never include order IDs, outbox IDs, recipients, payloads, provider identifiers, provider error bodies, claim tokens, or secrets.

`SENT` means Resend accepted the request and returned a provider message ID. It is not proof that the recipient's inbox accepted or displayed the message.

`nextAttemptAt` remains authoritative for retry timing. The scheduler merely wakes the durable worker; it does not force an event to run early. Missed scheduler invocations do not remove or lose outbox events. The `after()` callbacks remain the immediate best-effort path, while the recurring external scheduler is the recovery authority.

## Release and rollback

Apply `20261002000000_order_email_outbox` before deploying application code that writes to the outbox. The migration intentionally does not backfill historical orders. During the migration-to-deployment cutover gap, the old application remains compatible with the additive schema and creates no email events; therefore orders completed in that gap do not receive an automatic historical email.

Before enabling delivery, configure the production `RESEND_API_KEY` and `DEIGON_ORDER_EMAIL_SCHEDULER_SECRET`, deploy the reviewed application, and configure the external scheduler with its dedicated bearer credential. Run one controlled real order through the normal payment flow and verify the outbox and provider result without retrying the payment or manually changing order state.

If delivery misbehaves, pause the external scheduler and roll the application back while leaving the additive outbox schema in place. Do not delete outbox rows or manually mark them `SENT`. Existing pending rows remain durable for investigation and a corrected dispatcher can resume them later. Rollback must not change payment, fulfilment, inventory, or order authority.
