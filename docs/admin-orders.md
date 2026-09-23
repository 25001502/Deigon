# Admin orders: B1 backend foundation

**Production rollout remains blocked.** B1 adds the database and server foundation only. `/admin/orders` remains the existing placeholder. List/detail pages, buttons and ETA forms belong to B2. No cancellation or refund operation is provided.

## Authority and write boundary

The existing verified Yoco webhook remains payment truth. An ADMIN may manage fulfilment only after the Order and its associated Payment consistently say PAID, their monetary amounts match exactly, confirmation exists, and cancellation/inventory-release timestamps are absent.

All four APIs call the existing `requireAdmin()` independently. Reusable server queries and mutations also call it, so future server-page callers cannot accidentally omit authorization. This deliberately means an API request performs two role checks; neither is cached, and both happen before the mutation transaction. Identity comes from verified Supabase Auth and role from public User, never request metadata or role claims.

The only write is `Order.update` with allowlisted `status` and one milestone timestamp, or `estimatedDeliveryDate`. Prisma also maintains Order.updatedAt. Payment (including updatedAt), paymentStatus, confirmedAt, cancelledAt, cancelReason, inventoryReleasedAt, money and historical snapshots are never written. Inventory, Cart and CartItem receive no writes. Checkout, Yoco, webhook and expiry implementations are unchanged.

## State machine and history

| Fulfilment | Permitted path |
| --- | --- |
| DELIVERY | CONFIRMED → PROCESSING → SHIPPED → DELIVERED |
| PICKUP | CONFIRMED → PROCESSING → READY_FOR_PICKUP → DELIVERED |

PENDING has no admin transition. CANCELLED and DELIVERED are terminal. Skips, backwards transitions and cross-branch statuses are conflicts. The pure `lib/orders/fulfilment.ts` owns these edges and their timestamp mapping.

Each successful transition writes exactly one server-generated timestamp: processingAt, shippedAt, readyForPickupAt or deliveredAt. Existing NULL historical milestones are valid and stay NULL. Future-stage timestamps, opposite-branch timestamps, or populated timestamps with reversed chronology conflict; they are never repaired or overwritten. The new milestone cannot precede an existing known milestone or confirmation.

No transition reserves, releases or restores stock. Inventory was handled by checkout and the existing payment lifecycle. Cancellation/refunds, their provider reconciliation and any inventory return policy require a separate reviewed phase.

## Locking and retries

Mutations authorize first, then open a READ COMMITTED transaction (5-second acquisition wait, 10-second transaction timeout). A parameterized SELECT locks only the target Order `FOR UPDATE`. The selected Order and associated Payment summary are read after this lock, without a Payment row lock. This avoids introducing an Order-to-Payment lock acquisition that would oppose the webhook's existing locks.

Fulfilment body:

```json
{ "expectedStatus": "PROCESSING", "targetStatus": "SHIPPED" }
```

The actual status must equal expectedStatus and the edge must be allowed. If the actual status already equals targetStatus, the requested edge is its immediate predecessor edge, and its milestone exists, the response is a successful no-op, retaining the original timestamp and updatedAt. A retry after the order has progressed beyond its target is a 409. An unexpected pre-existing target milestone is also a 409.

## Estimated delivery date

The estimate is a PostgreSQL DATE returned as `YYYY-MM-DD`, or null. It is editable only for consistently paid DELIVERY orders in CONFIRMED, PROCESSING or SHIPPED. PICKUP and DELIVERED reject even no-op estimate requests. No pickup estimate is introduced.

```json
{
  "expectedStatus": "PROCESSING",
  "expectedEstimatedDeliveryDate": null,
  "estimatedDeliveryDate": "2028-02-29"
}
```

Both expected values are checked inside the Order lock. A different competing value conflicts instead of overwriting. If the target value is already applied and the expected status still matches, it is a no-op. Dates must be real calendar dates and a newly assigned date must be today or later in Africa/Johannesburg. Stored overdue estimates are neither repaired nor automatically cleared; retrying that same stored value is permitted. Null clears an estimate while editable. Serialization never uses the browser's local timezone.

## API contract

| Method | Route | Result under `data` |
| --- | --- | --- |
| GET | `/api/admin/orders` | `{ orders, nextCursor }` |
| GET | `/api/admin/orders/[orderId]` | Selected historical order detail |
| PATCH | `/api/admin/orders/[orderId]/fulfilment` | Selected updated detail |
| PATCH | `/api/admin/orders/[orderId]/estimated-delivery` | Selected updated detail |

Success is `{ ok: true, data }`; errors follow existing `{ ok: false, message }`. Every handler response, including errors, sends `Cache-Control: private, no-store, max-age=0`. Statuses: 401 unauthenticated; 403 non-admin or rejected origin; 400 malformed input; 404 missing order; 409 invalid transition, inconsistency or stale edit; generic 500 for unexpected failure. No provider/database details appear in unexpected-error responses.

PATCH requires `application/json` (parameters such as charset are accepted) and an Origin exactly matching the configured application origin. Configuration uses APP_URL, falling back to NEXT_PUBLIC_SITE_URL; it must be an HTTPS origin without credentials, paths, query or fragment. Explicit HTTP localhost, 127.0.0.1 and [::1] origins are accepted only outside production. Missing/invalid configuration fails closed. There is no request-host fallback or wildcard credentialed CORS. Unknown body fields are rejected, including timestamps, money, roles, identities and Payment objects.

List parameters are `search`, `status`, `fulfilmentType`, `paymentStatus`, `limit`, `cursor`. Search is trimmed, bounded to 200 characters and case-insensitive across orderNumber/customerName/customerEmail. This is a submitted-query API; B2 should submit searches deliberately. Default page size is 25 and maximum 50. Results use descending createdAt then id and take one extra row to determine nextCursor, without a total-count query. Cursor structure/version/date/id are validated and bound to the normalized search/filter set; changed filters require a fresh page. The cursor is a pagination position, not an authorization credential. No new index is introduced; inspect actual query plans and traffic before considering a later search-index migration.

List/detail use explicit selects and serialized DTOs. All monetary values retain exactly two decimals. Detail uses historical customer, address and item snapshots, even if live records change or optional relations are deleted. Payment exposes only provider, amount and status; Order.paymentStatus is separately readable. No transactionId, providerCheckoutId, idempotencyKey or internal relation identifiers are returned.

## Migration, rollout and rollback

`20260920000000_admin_order_fulfilment` sorts after the previously latest migration `20260917174904_add_payment_provider_checkout_id`. It adds only processingAt, shippedAt, readyForPickupAt and deliveredAt as nullable TIMESTAMP(3), and estimatedDeliveryDate as nullable DATE. There are no defaults, backfills, indexes, enums or relationships. Existing orders receive NULL; createdAt/updatedAt are not used to invent history.

Before any future production rollout, separately review:

1. Actual code diff and additive migration.
2. Deployed public Order table Supabase Data API exposure, grants and RLS policies. Server guards do not prove direct Data API writes are denied. Verify anonymous/CUSTOMER roles cannot change status or these new columns through table-level or column-level grants/policies, and review existing privileged access.
3. Migration execution order and deployment procedure. Apply the reviewed additive migration before deploying the regenerated Prisma client/backend that selects these fields. Even older broad Order reads using a newly generated client may select new columns; do not deploy that client before the database change.
4. Production browser/admin behavior and a separately authorized rollout.

No production migration is performed by the tests or build helper. Local tests create fresh loopback PostgreSQL clusters, apply the previous migrations to an empty database, seed PENDING/CONFIRMED orders, then apply B1 and compare old values, Payment rows, constraints, indexes and column definitions. They verify real foreign-key/unique violations still reject bad data.

For application rollback, roll back to the previous application/client and leave the additive nullable columns in place. Do not drop columns or erase recorded fulfilment milestones as an automatic rollback. Any later schema removal requires a separate reviewed migration and data-retention decision. Rolling back B1 does not reverse fulfilment status changes already made.

## Local validation

```powershell
npx.cmd prisma generate
node --test --test-concurrency=1 tests/admin-b1/*.mjs
node --test --test-concurrency=1 tests/admin-a/*.mjs
node --test --test-concurrency=1 tests/phase-5/checkout-hardening.mjs tests/phase-6a/*.mjs tests/phase-6b/*.mjs tests/phase-6c/*.mjs tests/phase-6d/*.mjs tests/phase-6e/*.mjs
npx.cmd tsc --noEmit --incremental false
npx.cmd eslint lib/admin/orders lib/orders/fulfilment.ts app/api/admin/orders tests/admin-b1
node tests/admin-b1/support/build.mjs
git diff --check
```

The build helper executes the package build's Prisma generation and Next production build steps with DATABASE_URL and DIRECT_URL pointing only to its disposable loopback database. PostgreSQL binaries follow existing conventions at `node_modules/.cache/phase-5-postgres/package/native/bin`, overridable by DEIGON_TEST_PG_BIN. Test hooks replace only infrastructure boundaries, use real requireAdmin/requireUser code with verified-session fixtures, and exercise the unchanged webhook processor without provider network requests.

Database tests compare entire Payment rows, protected Order columns and item snapshots, Inventory, Cart and CartItem before/after actions, retries, conflicts and forced rollback. Race tests observe real PostgreSQL lock waits, including admin/webhook interactions in both directions. A passing local suite is not approval for production rollout.
