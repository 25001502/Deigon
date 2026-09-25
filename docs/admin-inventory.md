# Admin inventory management

Admin inventory routes use the existing Supabase session and require `public."User".role = ADMIN` on every page, API handler, and server query or mutation. There is no separate admin identity store and no client-supplied actor identity.

## Stock model

Each `ProductVariant` should have one `Inventory` row. Admin D creates that row at quantity zero. The schema guarantees at most one row through the unique `variantId`; Admin E surfaces a missing row as `MISSING_INVENTORY` and blocks adjustments rather than silently creating stock.

Admin E uses three states only:

- `MISSING_INVENTORY`
- `OUT_OF_STOCK` for quantity zero
- `IN_STOCK` for quantity above zero

Archived products remain visible and adjustable for reconciliation.

## Manual adjustments

`InventoryAdjustment` records are immutable manual audit entries. They are separate from checkout reservations and automatic unpaid-order restoration. No Admin E endpoint updates or deletes history.

The mutation accepts a signed integer delta, never an absolute replacement quantity. The server locks the target Inventory row, verifies the expected quantity and timestamp, rejects negative or overflowing results, updates Inventory, and inserts history in one transaction.

Each deliberate action carries a UUID idempotency key. Exact sequential or concurrent replays return the existing adjustment. Reusing a key for another admin, variant, delta, reason, note, or starting quantity returns `409`. A unique-key race rolls back the losing transaction before the existing record is loaded; the stock mutation is never retried.

## Endpoints

- `GET /api/admin/inventory`
- `GET /api/admin/inventory/[variantId]`
- `GET /api/admin/inventory/[variantId]/adjustments`
- `POST /api/admin/inventory/[variantId]/adjustments`

Mutation requests require the configured application origin and `application/json`. Responses are private and non-cacheable.

## Migration deployment gate

`20260925000000_admin_inventory_adjustments` is additive and explicitly wrapped in `BEGIN`/`COMMIT`. If enum, table, constraint validation, index, or foreign-key creation fails, PostgreSQL rolls back the complete Admin E migration instead of leaving a partially applied schema.

Before production deployment, run a separately authorized read-only query confirming every existing Inventory quantity is nonnegative. Do not deploy the migration until that preflight passes.
