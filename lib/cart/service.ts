import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api/errors";
import type { Prisma } from "@prisma/client";

// Selects only the fields the cart API response (serializeCart) and frontend (CartProvider,
// cart-page) actually consume. Replaces the previous deep `include` (which pulled every Product
// field, the full Category row, ALL ProductImages, and every ProductVariant/Inventory field) with
// a narrow `select`. The cart UI only ever renders the FIRST product image, so we also cut the
// image fetch from "all images for the product" down to the single lowest-position row.
const cartSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  items: {
    select: {
      variantId: true,
      quantity: true,
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          badge: true,
          category: { select: { name: true, slug: true } },
          images: {
            select: { url: true, alt: true, position: true },
            orderBy: { position: "asc" as const },
            take: 1,
          },
        },
      },
      variant: {
        select: {
          id: true,
          size: true,
          color: true,
          price: true,
          inventory: { select: { quantity: true } },
        },
      },
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.CartSelect;

// Prisma's default interactive-transaction timeout (5000ms) is too short for this project's
// Supabase pooler round-trips (each transaction here does several sequential queries: variant
// lookup, cart upsert, cart item read + write). Once the timeout was exceeded, Prisma threw
// PrismaClientKnownRequestError ("Unable to start a transaction in the given time" / a commit on
// an expired transaction), which lib/api/errors.ts correctly, but unhelpfully, mapped to a bare
// 500 on POST /api/cart/items. Raising both maxWait (time allowed to acquire a pooled connection)
// and timeout (time allowed for the transaction body to run) fixes the 500 without touching the
// variant-aware cart logic itself.
const cartTransactionOptions = { maxWait: 15000, timeout: 15000 };

export type CartWithItems = Awaited<ReturnType<typeof getOrCreateCart>>;

type CartItemPayload = {
  variantId: string;
  quantity: number;
};

function requirePositiveQuantity(quantity: unknown) {
  if (!Number.isInteger(quantity) || (quantity as number) <= 0) {
    throw new ApiError("quantity must be a positive integer", 400);
  }
  return quantity as number;
}

async function getVariantForCart(tx: Prisma.TransactionClient, variantId: string) {
  const variant = await tx.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true, inventory: true },
  });

  if (!variant) throw new ApiError("Product variant not found", 404);
  if (!variant.product.isActive) throw new ApiError("Product is not available", 409);
  if (!variant.inventory) throw new ApiError("Product variant has no inventory record", 409);

  return variant;
}

// Accepts either the top-level `prisma` client or an in-flight `tx` transaction client so callers
// that already hold an open transaction can fetch the full cart payload as part of that same
// transaction/connection instead of issuing a brand-new `$transaction()` (with its own connection
// acquisition) immediately afterward. This is the key change that removes the redundant
// "mutate, then separately re-fetch the whole cart" round trip that dominated request latency.
async function fetchCart(client: Prisma.TransactionClient | typeof prisma, userId: string) {
  return client.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: cartSelect,
  });
}

export async function getOrCreateCart(userId: string) {
  return fetchCart(prisma, userId);
}

export async function getCart(userId: string) {
  return getOrCreateCart(userId);
}

export async function addItem(userId: string, payload: CartItemPayload) {
  const quantity = requirePositiveQuantity(payload.quantity);

  return prisma.$transaction(async (tx) => {
    const variant = await getVariantForCart(tx, payload.variantId);
    const cart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    const existing = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    });

    const nextQuantity = (existing?.quantity ?? 0) + quantity;

    if (nextQuantity > variant.inventory!.quantity) {
      throw new ApiError("Requested quantity exceeds available stock", 409);
    }

    if (existing) {
      await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity } });
    } else {
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          productId: variant.productId,
          variantId: variant.id,
          quantity,
        },
      });
    }

    // Fetch the full cart payload within the same transaction/connection rather than making a
    // second, separate `$transaction()` call after this one commits.
    return fetchCart(tx, userId);
  }, cartTransactionOptions);
}

export async function updateItem(userId: string, variantId: string, rawQuantity: unknown) {
  const quantity = requirePositiveQuantity(rawQuantity);

  return prisma.$transaction(async (tx) => {
    const variant = await getVariantForCart(tx, variantId);
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (!cart) throw new ApiError("Cart item not found", 404);

    const item = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
    if (!item) throw new ApiError("Cart item not found", 404);
    if (quantity > variant.inventory!.quantity) {
      throw new ApiError("Requested quantity exceeds available stock", 409);
    }

    await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });

    return fetchCart(tx, userId);
  }, cartTransactionOptions);
}

export async function removeItem(userId: string, variantId: string) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (!cart) throw new ApiError("Cart item not found", 404);

    const item = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
    if (!item) throw new ApiError("Cart item not found", 404);

    await tx.cartItem.delete({ where: { id: item.id } });

    return fetchCart(tx, userId);
  }, cartTransactionOptions);
}

export async function clearCart(userId: string) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return fetchCart(tx, userId);
  }, cartTransactionOptions);
}

export async function mergeItems(userId: string, items: Array<{ variantId?: unknown; slug?: unknown; quantity?: unknown }>) {
  const results: { variantId: string; quantity: number; status: "merged" | "skipped"; reason?: string }[] = [];

  const cart = await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });

    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        results.push({ variantId: String(item.variantId ?? item.slug ?? "unknown"), quantity: 0, status: "skipped", reason: "Invalid quantity" });
        continue;
      }

      const variant = item.variantId
        ? await tx.productVariant.findUnique({ where: { id: String(item.variantId) }, include: { product: true, inventory: true } })
        : item.slug
          ? await tx.productVariant.findFirst({ where: { product: { slug: String(item.slug) } }, include: { product: true, inventory: true } })
          : null;

      if (!variant || !variant.product.isActive || !variant.inventory) {
        results.push({ variantId: String(item.variantId ?? item.slug ?? "unknown"), quantity, status: "skipped", reason: "Unavailable variant" });
        continue;
      }

      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } } });
      const nextQuantity = Math.min((existing?.quantity ?? 0) + quantity, variant.inventory.quantity);
      if (nextQuantity <= 0) {
        results.push({ variantId: variant.id, quantity, status: "skipped", reason: "Out of stock" });
        continue;
      }

      if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity } });
      else await tx.cartItem.create({ data: { cartId: cart.id, productId: variant.productId, variantId: variant.id, quantity: nextQuantity } });
      results.push({ variantId: variant.id, quantity: nextQuantity, status: "merged" });
    }

    return fetchCart(tx, userId);
  }, { maxWait: 15000, timeout: Math.max(15000, items.length * 5000) });

  return { cart, results };
}

export function serializeCart(cart: CartWithItems) {
  const items = cart.items.map((item) => {
    const inventoryQuantity = item.variant.inventory?.quantity ?? 0;
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      lineTotal: Number(item.variant.price) * item.quantity,
      product: {
        id: item.product.id,
        slug: item.product.slug,
        name: item.product.name,
        vendor: item.product.category.name,
        collectionHandle: item.product.category.slug,
        badge: item.product.badge,
        images: item.product.images.map((image) => ({ url: image.url, alt: image.alt, position: image.position })),
      },
      variant: {
        id: item.variant.id,
        size: item.variant.size,
        color: item.variant.color,
        price: Number(item.variant.price),
        inventory: { quantity: inventoryQuantity, inStock: inventoryQuantity > 0 },
      },
    };
  });

  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}
