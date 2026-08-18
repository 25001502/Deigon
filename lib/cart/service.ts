import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api/errors";
import type { Prisma } from "@prisma/client";

const cartInclude = {
  items: {
    include: {
      product: {
        include: { category: true, images: { orderBy: { position: "asc" as const } } },
      },
      variant: { include: { inventory: true } },
    },
    orderBy: { id: "asc" as const },
  },
};

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

export async function getOrCreateCart(userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: cartInclude,
  });
}

export async function getCart(userId: string) {
  return getOrCreateCart(userId);
}

export async function addItem(userId: string, payload: CartItemPayload) {
  const quantity = requirePositiveQuantity(payload.quantity);

  await prisma.$transaction(async (tx) => {
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
  });

  return getCart(userId);
}

export async function updateItem(userId: string, variantId: string, rawQuantity: unknown) {
  const quantity = requirePositiveQuantity(rawQuantity);

  await prisma.$transaction(async (tx) => {
    const variant = await getVariantForCart(tx, variantId);
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (!cart) throw new ApiError("Cart item not found", 404);

    const item = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
    if (!item) throw new ApiError("Cart item not found", 404);
    if (quantity > variant.inventory!.quantity) {
      throw new ApiError("Requested quantity exceeds available stock", 409);
    }

    await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
  });

  return getCart(userId);
}

export async function removeItem(userId: string, variantId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) throw new ApiError("Cart item not found", 404);

  const item = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
  if (!item) throw new ApiError("Cart item not found", 404);

  await prisma.cartItem.delete({ where: { id: item.id } });
  return getCart(userId);
}

export async function clearCart(userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCart(userId);
}

export async function mergeItems(userId: string, items: Array<{ variantId?: unknown; slug?: unknown; quantity?: unknown }>) {
  const results: { variantId: string; quantity: number; status: "merged" | "skipped"; reason?: string }[] = [];

  await prisma.$transaction(async (tx) => {
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
  });

  return { cart: await getCart(userId), results };
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
