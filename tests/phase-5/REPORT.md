# Phase 5 Checkout Hardening

Date: 2026-09-16. Branch: `phase-5-hardening`. No commit or push.

## Scope and Data Safety

Tests executed the real checkout route, checkout service, cart service, Prisma
client, and PostgreSQL transactions. Only database wiring and authenticated
identity resolution were replaced in an in-memory test bundle. Two distinct test
user identities exercised ownership and stock contention. This is not a live
Supabase authentication or browser test.

Every run initialized its own PostgreSQL 17.10 cluster, bound exclusively to
`127.0.0.1` on a dynamically selected port. The harness never reads a production
connection string. Prisma's read-only `migrate diff --from-empty --to-schema`
generated additive DDL from the existing schema for this empty local database;
no migration file was created or applied. Existing project config is loaded by
the CLI, but neither diff source is a database connection.

All users, products, carts, orders, and payments used in tests were newly created
local fixtures. Inventory quantities/timestamps and product availability were
recorded before changes and restored by exact primary key after each test,
including failed tests. No real customer records were read, changed, or deleted.
No orders, payments, or users were deleted for cleanup. Normal checkout/cart
operations deleted only fixture cart lines. Fixture orders and other diagnostic
data remain in the stopped, ignored local test clusters. These are test records,
not production orders; their restored inventory is not a live stock ledger.

## Files Changed

- `lib/checkout/service.ts`: lock the cart before the transactional idempotency
  check and cart snapshot; select and snapshot the actual variant SKU.
- `lib/cart/service.ts`: take the matching cart lock in add, update, remove,
  clear, and merge operations before reading mutable cart state.
- `tests/phase-5/checkout-hardening.mjs`: isolated integration/regression harness.
- `tests/phase-5/REPORT.md`: evidence, reproduction instructions, and limitations.

No changes to Prisma schema, migrations, Prisma configuration, `lib/prisma.ts`,
environment files, Supabase configuration, auth, API routes, frontend, or Yoco
implementation. Decimal calculations, atomic stock predicates, order/payment
creation, and transactional cart clearing remain in place.

## Baseline and Reproduced Bugs

Before backend edits: TypeScript, Prisma validation, and `git diff --check` passed.
The first integration suite had **21 passing and 7 failing tests**.

| Reproduction | Before fix | Root cause and fix |
| --- | --- | --- |
| Two overlapping requests, same user/key, one unit left | One 201 and one stock-related 409, rather than the same order twice | Both requests passed idempotency checks before either committed; the loser hit stock failure before the unique-key check. Lock the cart, then re-check idempotency. |
| Same cart, two different keys, sufficient stock | Two 201 responses, two orders/payments, inventory consumed twice | Both transactions read the same cart snapshot. Cart lock makes the second request observe the consumed cart and return 400. |
| Checkout snapshot followed by quantity update | Update reported 200 for quantity 2, but checkout ordered quantity 1 and removed the line | Cart edits could change a line after checkout read it. Shared lock orders the operations; stale update after checkout gets 404. |
| Checkout snapshot followed by removal | Removal reported success while the removed line was still ordered | Same uncoordinated snapshot. A removal queued after checkout gets 404; a removal that holds the lock first makes checkout see an empty cart. |
| Add to an existing line, or merge, after checkout snapshot (2 tests) | Successful additions disappeared from the cart without being ordered | Checkout deleted the original line ID after its quantity changed. Both mutation paths now lock the cart; additions after checkout survive as new lines. |
| Order item SKU snapshot | Stored variant ID in `OrderItem.sku` | SKU was not selected and `item.variant.id` was assigned. Select `sku` and assign `item.variant.sku`. |

The initial two-user last-unit and multi-quantity stock races already passed;
the atomic inventory update did not need changing. Sequential replay,
cross-user ownership checks, Decimal totals, and rollback also passed initially.

## Exact Concurrency Method

The harness pauses checkout A immediately after its real transactional cart
read. It starts checkout/cart operation B on another pooled connection and waits
until B finishes or PostgreSQL reports a lock wait in `pg_stat_activity`, then
releases A. This reproduces overlap without relying on arbitrary sleep duration.

The reverse-order tests pause a cart mutation after its write, start checkout,
verify checkout waits on a database lock, then release the mutation. Separate
tests launch eight checkout requests simultaneously and six cart additions
simultaneously. Two carts insert shared variants in opposite orders to exercise
inventory lock ordering.

## Final Results

**41 passed, 0 failed**, including all seven original failures.

| Tests | Expected and observed after fix |
| --- | --- |
| Sequential same-key replay | Identical order, one payment, stock decremented once; newly added cart line survives replay. |
| Concurrent same key, stock 1 and 10 (2) | Both 201, same order ID, one payment, one decrement. |
| Concurrent different keys on one cart | One 201, one 400 empty-cart response; one order/payment. |
| Two users, inventory 1, each requesting 1 | One 201, one 409; stock 0; losing cart intact. |
| Two users, inventory 3, each requesting 2 | One 201, one 409; stock 1; losing cart intact. |
| Checkout first: update/remove/add-existing/add-new/clear/merge (6) | Original snapshot ordered once; stale update/remove get 404; additions/merges survive; clear completes cleanly. |
| Cart mutation first, same six operations (6) | Checkout waits and reads committed changes; removal/clear result in empty-cart 400. |
| Injected failure before order creation, after nested order/items/payment creation, and after cart clearing (3) | 500 response; complete rollback, unchanged inventory/cart, no order/items/payment. Injection exists only in test hooks. |
| Second variant out of stock | First variant's decrement rolls back; no partial order/payment/cart writes. |
| Missing inventory record | Clean 409; no partial writes. |
| Eight requests with one key | Eight 201 responses for one order/payment; one decrement. |
| Eight requests with different keys on one cart | One 201 and seven 400 responses; one decrement. |
| Shared variants inserted in opposite cart order | Both orders succeed; exact stock counts; no deadlock. |
| Six simultaneous adds to one existing line | All succeed; quantity increases from 1 to 7 with no lost updates. |
| Excess quantity, zero stock, inactive product (3) | 409 with unchanged inventory, order/payment counts, and cart. |
| Empty cart, zero and negative cart quantities (3) | 400 with no partial writes. |
| Missing variant | Cart addition returns 404. Database foreign key rejects a dangling cart line with P2003; constraints were not disabled to manufacture corruption. |
| Cross-user replay and simultaneous key reuse (2) | 409 `Invalid idempotency key`, no order payload leakage or second reservation. |
| Decimal totals and client-field tampering (3) | 0.10 x 3 = 0.30 plus 80 delivery; 599.98 attracts 80 delivery; 600.00 has free delivery. Client totals, price, status, paymentStatus, and userId ignored. Payment/order remain PENDING. |
| SKU/size/color snapshot | Matches the actual ProductVariant fields. |
| Missing authenticated identity | Route maps injected authentication failure to 401. Actual Supabase cookies were not exercised. |

No observed deadlock/serialization error required a retry. No retry code was
added; the existing unique-collision handling remains unchanged. The shared cart
lock precedes mutable cart reads and inventory writes; inventory updates retain
their existing sorted variant order.

## Validation

- `npx.cmd tsc --noEmit`: passed before and after backend changes.
- `npx.cmd prisma validate`: passed before and after backend changes.
- `git diff --check`: passed; only Git LF/CRLF notices.
- Scoped ESLint: passed for the two services and final ESM test runner.

`npx.cmd` is the Windows equivalent of the requested `npx` commands; the current
PowerShell execution policy blocks `npx.ps1`.

Raw local evidence (ignored under `node_modules/.cache/phase-5-tests/`):

- `run-j7Z5Ka/results.json`: first run, 21 passed / 7 failed.
- `run-Iet5vS/results.json`: all original 28 tests pass after fixes.
- `run-6kf1cZ/results.json`: final ESM harness, 41 passed / 0 failed, including
  original inventory snapshots and restoration flags.

## Reproduction

Run `node tests/phase-5/checkout-hardening.mjs` from the repository root after
installing project dependencies. The harness uses the existing `pg`, Prisma,
and `esbuild` (via `tsx`) packages; no package/lockfile changes were needed.

Provide PostgreSQL executables using `DEIGON_TEST_PG_BIN`, pointing to a directory
with `initdb` and `pg_ctl`. The Windows default is the ignored directory
`node_modules/.cache/phase-5-postgres/package/native/bin`.

This run used binaries from `@embedded-postgres/windows-x64@17.10.0-beta.17`.
The package's [upstream documentation](https://github.com/leinelissen/embedded-postgres)
describes the platform binaries. Download/extract them separately; the harness
does not install dependencies or accept a database URL. Each run starts a new
cluster and stops it in `finally`. Windows process sandboxing can prevent
PostgreSQL token creation; execution outside that sandbox was necessary here.

## Remaining Risks and Yoco Readiness

Proceed with Yoco integration development. Do not treat these local results as
production-readiness approval: repeat representative races with real authenticated
sessions against a dedicated staging Supabase project/pooler before rollout.
Supabase authentication, network failures, pool exhaustion, and lock latency
under production-like load were not verified. The existing 15-second transaction
limits remain unchanged.

The installed Prisma adapter/pg combination emitted a pg@9 deprecation warning
about concurrent queries on one connection, both before and after changes.
Tracing located it in `@prisma/adapter-pg` and Prisma's query interpreter. All
tests passed on the installed pg version; dependency upgrades are outside this
phase.

Cart locking protects server data. It does not synchronize optimistic cart UI
across tabs or devices. Payment settlement, webhooks, cancellation, and unpaid
reservation release were not tested or implemented in this phase.
