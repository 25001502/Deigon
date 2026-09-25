# Admin product management

Admin D manages catalogue data through `/admin/products` and `/api/admin/products/*`. It uses the existing `Product`, `ProductImage`, `ProductVariant`, `Category`, and `Inventory` models; this phase adds no schema or migration.

## Security and validation

Every page calls `requireAdminPage()`. Every API handler and service calls `requireAdmin()`, which resolves the current Supabase user and reads the role from public `User`. Mutations also require the configured same-origin `Origin` header and an `application/json` body. Request objects are exact-shape validated, so client identity, role, inventory quantity, sale price, provider, and other undeclared fields are rejected.

API responses use explicit catalogue projections. Inventory quantities, payment data, provider identifiers, user identifiers, and internal errors are not returned.

## Catalogue behavior

- Product create writes the product, ordered images, variants, and a zero-quantity `Inventory` row for each new variant in one transaction. A missing inventory row is invalid for cart and checkout reads, while zero stock is the established unavailable state.
- Product updates can change existing catalogue fields only. They never update inventory or historical order snapshots.
- Variant create and edit support SKU, size, colour, and normal price. Sale pricing is outside Admin D.
- Product removal is an archive operation using the existing `Product.isActive` field. It never deletes a product, variant, cart row, inventory row, order, or order item.
- Variant deletion is blocked. `ProductVariant` has no active/archive field, and variants can be referenced by inventory, carts, and historical orders.

## Concurrency

Product and variant mutations require the last observed product `updatedAt`. The transaction performs a conditional product update using that timestamp. A stale request receives HTTP 409 and must reload before it can write. Variant changes also advance the parent product timestamp, so separate metadata and variant editors share one concurrency boundary.

## Legacy product mutation routes

Public `GET /api/products` and `GET /api/products/[slug]` remain unchanged. The older admin mutation handlers at `/api/products` and `/api/products/[id]` delegate to the Admin D handlers so they cannot bypass same-origin validation, strict catalogue input, optimistic concurrency, or the inventory boundary.
