# Storefront base-price consistency

DEIGON supports a distinct normal price on each `ProductVariant`. Sale and discount pricing are not part of this contract.

Public product responses order variants deterministically by `createdAt`, then `id`. Storefront product cards and purchase panels before a variant is selected display the lowest normal variant price. After a shopper selects a variant, the product detail and quick-view purchase panels display that exact variant's price.

The homepage, collection pages, product detail pages, and public product APIs are dynamically rendered because catalogue prices can change through Admin D. They read current `ProductVariant.price` values and do not require Admin D cache invalidation. A rejected optimistic-concurrency update does not change public catalogue data.

Checkout continues to ignore client prices and calculates totals from the authoritative server-side `ProductVariant.price`. Existing `OrderItem.unitPrice` and `lineTotal` values are historical snapshots and are never rewritten by catalogue edits.
