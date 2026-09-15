import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api/errors";
import { Prisma } from "@prisma/client";

const checkoutTransactionOptions = {
  maxWait: 15000,
  timeout: 15000,
};

const FREE_DELIVERY_THRESHOLD = new Prisma.Decimal("600.00");
const DELIVERY_FEE = new Prisma.Decimal("80.00");
const ZERO = new Prisma.Decimal("0.00");

const PAYMENT_PROVIDER = "YOCO";

export type CreateOrderInput = {
  idempotencyKey: string;

  fulfilmentType: "DELIVERY" | "PICKUP";

  customerName: string;
  customerEmail: string;
  customerPhone?: string;

  shippingAddressLine1?: string;
  shippingAddressLine2?: string;
  shippingCity?: string;
  shippingProvince?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;

  pickupLocation?: string;
};

type CheckoutResult = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfilmentType: string;
  subtotal: string;
  shippingFee: string;
  total: string;
};

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
  maxLength = 255,
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(`${fieldName} is required`, 400);
  }

  const valueTrimmed = value.trim();

  if (valueTrimmed.length > maxLength) {
    throw new ApiError(`${fieldName} is too long`, 400);
  }

  return valueTrimmed;
}

function optionalString(
  value: unknown,
  fieldName: string,
  maxLength = 255,
) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ApiError(`${fieldName} must be a string`, 400);
  }

  const valueTrimmed = value.trim();

  if (valueTrimmed.length > maxLength) {
    throw new ApiError(`${fieldName} is too long`, 400);
  }

  return valueTrimmed || undefined;
}

function validateCheckoutInput(input: CreateOrderInput) {
  const idempotencyKey = requireNonEmptyString(
    input.idempotencyKey,
    "idempotencyKey",
    255,
  );

  const customerName = requireNonEmptyString(
    input.customerName,
    "customerName",
    120,
  );

  const customerEmail = requireNonEmptyString(
    input.customerEmail,
    "customerEmail",
    320,
  ).toLowerCase();

  const fulfilmentType = input.fulfilmentType;

  if (fulfilmentType !== "DELIVERY" && fulfilmentType !== "PICKUP") {
    throw new ApiError("Invalid fulfilment type", 400);
  }

  const customerPhone = optionalString(input.customerPhone, "customerPhone", 40);

  const shippingAddressLine1 = optionalString(
    input.shippingAddressLine1,
    "shippingAddressLine1",
    255,
  );

  const shippingAddressLine2 = optionalString(
    input.shippingAddressLine2,
    "shippingAddressLine2",
    255,
  );

  const shippingCity = optionalString(
    input.shippingCity,
    "shippingCity",
    120,
  );

  const shippingProvince = optionalString(
    input.shippingProvince,
    "shippingProvince",
    120,
  );

  const shippingPostalCode = optionalString(
    input.shippingPostalCode,
    "shippingPostalCode",
    30,
  );

  const shippingCountry =
    optionalString(input.shippingCountry, "shippingCountry", 120) ??
    "South Africa";

  const pickupLocation = optionalString(
    input.pickupLocation,
    "pickupLocation",
    255,
  );

  if (fulfilmentType === "DELIVERY") {
    if (!shippingAddressLine1) {
      throw new ApiError("shippingAddressLine1 is required for delivery", 400);
    }

    if (!shippingCity) {
      throw new ApiError("shippingCity is required for delivery", 400);
    }

    if (!shippingProvince) {
      throw new ApiError("shippingProvince is required for delivery", 400);
    }

    if (!shippingPostalCode) {
      throw new ApiError("shippingPostalCode is required for delivery", 400);
    }
  }

  if (fulfilmentType === "PICKUP" && !pickupLocation) {
    throw new ApiError("pickupLocation is required for pickup", 400);
  }

  return {
    idempotencyKey,
    fulfilmentType,
    customerName,
    customerEmail,
    customerPhone,
    shippingAddressLine1,
    shippingAddressLine2,
    shippingCity,
    shippingProvince,
    shippingPostalCode,
    shippingCountry,
    pickupLocation,
  };
}

function generateOrderNumber() {
  const date = new Date();

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let suffix = "";

  for (let i = 0; i < 5; i += 1) {
    suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return `DGN-${yyyy}${mm}${dd}-${suffix}`;
}

function serializeOrderResult(order: {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfilmentType: string;
  subtotal: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  total: Prisma.Decimal;
}): CheckoutResult {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfilmentType: order.fulfilmentType,
    subtotal: order.subtotal.toFixed(2),
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
  };
}

async function getExistingOrder(
  userId: string,
  idempotencyKey: string,
) {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      fulfilmentType: true,
      subtotal: true,
      shippingFee: true,
      total: true,
      userId: true,
    },
  });

  if (!existing) {
    return null;
  }

  if (existing.userId !== userId) {
    throw new ApiError("Invalid idempotency key", 409);
  }

  return serializeOrderResult(existing);
}

async function createOrderAttempt(
  userId: string,
  input: ReturnType<typeof validateCheckoutInput>,
) {
  return prisma.$transaction(async (tx) => {
    /*
     * Re-check idempotency inside the transaction.
     *
     * This protects concurrent requests where both requests passed the
     * initial pre-check before either one committed the order.
     */
    const existing = await tx.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfilmentType: true,
        subtotal: true,
        shippingFee: true,
        total: true,
        userId: true,
      },
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new ApiError("Invalid idempotency key", 409);
      }

      return serializeOrderResult(existing);
    }

    /*
     * The cart is the authoritative source of what the customer is
     * attempting to purchase. Prices are re-read from ProductVariant.
     */
    const cart = await tx.cart.findUnique({
      where: { userId },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            variantId: true,
            quantity: true,
            productId: true,
            variant: {
              select: {
                id: true,
                productId: true,
                size: true,
                color: true,
                price: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    isActive: true,
                    images: {
                      select: {
                        url: true,
                      },
                      orderBy: {
                        position: "asc",
                      },
                      take: 1,
                    },
                  },
                },
                inventory: {
                  select: {
                    quantity: true,
                  },
                },
              },
            },
          },
          orderBy: {
            variantId: "asc",
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new ApiError("Your cart is empty", 400);
    }

    /*
     * Validate every line before modifying inventory.
     *
     * We intentionally validate all requested quantities first so a bad
     * cart line doesn't partially reserve inventory before another line
     * fails validation.
     */
    for (const item of cart.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new ApiError("Invalid quantity in cart", 400);
      }

      if (!item.variant) {
        throw new ApiError("A product variant in your cart no longer exists", 409);
      }

      if (!item.variant.product.isActive) {
        throw new ApiError(
          `"${item.variant.product.name}" is no longer available`,
          409,
        );
      }

      if (!item.variant.inventory) {
        throw new ApiError(
          `"${item.variant.product.name}" has no inventory record`,
          409,
        );
      }
    }

    /*
     * Calculate the subtotal strictly from current database prices.
     * Prisma.Decimal avoids JavaScript floating-point arithmetic.
     */
    let subtotal = ZERO;

    for (const item of cart.items) {
      const lineTotal = item.variant.price.mul(item.quantity);
      subtotal = subtotal.add(lineTotal);
    }

    let shippingFee = ZERO;

    if (input.fulfilmentType === "DELIVERY") {
      shippingFee = subtotal.gte(FREE_DELIVERY_THRESHOLD)
        ? ZERO
        : DELIVERY_FEE;
    }

    const total = subtotal.add(shippingFee);

    /*
     * Reserve inventory atomically.
     *
     * Cart lines are already sorted by variantId, giving concurrent
     * checkouts a deterministic locking/update order and reducing
     * deadlock risk.
     */
    for (const item of cart.items) {
      const affectedRows = await tx.$executeRaw`
        UPDATE "Inventory"
        SET
          "quantity" = "quantity" - ${item.quantity},
          "updatedAt" = NOW()
        WHERE
          "variantId" = ${item.variantId}
          AND "quantity" >= ${item.quantity}
      `;

      if (affectedRows !== 1) {
        throw new ApiError(
          `"${item.variant.product.name}" does not have enough stock`,
          409,
        );
      }
    }

    /*
     * Snapshot order item data at purchase time.
     *
     * The order remains historically correct even if the product is later
     * renamed, repriced, or its images/variants change.
     */
    const orderItems = cart.items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.variant.price,
      lineTotal: item.variant.price.mul(item.quantity),

      title: item.variant.product.name,
      sku: item.variant.id,

      size: item.variant.size,
      color: item.variant.color,
      imageUrl: item.variant.product.images[0]?.url ?? null,

      productId: item.variant.product.id,
      variantId: item.variant.id,
    }));

    const orderNumber = generateOrderNumber();

    const order = await tx.order.create({
      data: {
        orderNumber,
        idempotencyKey: input.idempotencyKey,

        status: "PENDING",
        fulfilmentType: input.fulfilmentType,

        subtotal,
        shippingFee,
        total,

        paymentStatus: "PENDING",

        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,

        shippingAddressLine1: input.shippingAddressLine1,
        shippingAddressLine2: input.shippingAddressLine2,
        shippingCity: input.shippingCity,
        shippingProvince: input.shippingProvince,
        shippingPostalCode: input.shippingPostalCode,
        shippingCountry: input.shippingCountry,

        pickupLocation: input.pickupLocation,

        userId,

        items: {
          create: orderItems,
        },

        payment: {
          create: {
            amount: total,
            status: "PENDING",
            provider: PAYMENT_PROVIDER,
          },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfilmentType: true,
        subtotal: true,
        shippingFee: true,
        total: true,
      },
    });

    /*
     * Cart clearing happens inside the same transaction as the inventory
     * reservation and order creation.
     *
     * Either everything commits or nothing commits.
     */
    await tx.cartItem.deleteMany({
      where: {
        id: {
          in: cart.items.map((item) => item.id),
        },
      },
    });

    return serializeOrderResult(order);
  }, checkoutTransactionOptions);
}

export async function createOrder(
  userId: string,
  rawInput: CreateOrderInput,
) {
  const input = validateCheckoutInput(rawInput);

  /*
   * Fast idempotency path.
   *
   * Important: this happens BEFORE the cart-empty check. A successful
   * previous checkout has already cleared the cart, but a retry should
   * still return the original order.
   */
  const existing = await getExistingOrder(userId, input.idempotencyKey);

  if (existing) {
    return existing;
  }

  /*
   * Order-number collisions are theoretically possible. The random
   * suffix makes them extremely unlikely, but retrying the whole
   * transaction keeps the unique constraint authoritative.
   */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await createOrderAttempt(userId, input);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        /*
         * An idempotency collision means another concurrent request
         * completed the same checkout. Return its order.
         */
        const existingOrder = await getExistingOrder(
          userId,
          input.idempotencyKey,
        );

        if (existingOrder) {
          return existingOrder;
        }

        /*
         * Otherwise the unique collision was almost certainly the
         * generated orderNumber. Retry with a new random number.
         */
        if (attempt < 2) {
          continue;
        }
      }

      throw error;
    }
  }

  throw new ApiError("Unable to create order", 500);
}