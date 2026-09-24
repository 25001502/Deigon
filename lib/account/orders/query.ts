import "server-only";

import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;

const customerOrderSelect = {
  orderNumber: true,
  status: true,
  paymentStatus: true,
  fulfilmentType: true,
  subtotal: true,
  shippingFee: true,
  total: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  shippingAddressLine1: true,
  shippingAddressLine2: true,
  shippingCity: true,
  shippingProvince: true,
  shippingPostalCode: true,
  shippingCountry: true,
  pickupLocation: true,
  createdAt: true,
  confirmedAt: true,
  processingAt: true,
  shippedAt: true,
  readyForPickupAt: true,
  deliveredAt: true,
  estimatedDeliveryDate: true,
  cancelledAt: true,
  items: {
    select: {
      title: true,
      sku: true,
      size: true,
      color: true,
      imageUrl: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
    },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.OrderSelect;

type CustomerOrderRecord = Prisma.OrderGetPayload<{ select: typeof customerOrderSelect }>;

function serializeDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function serializeCustomerOrder(order: CustomerOrderRecord) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfilmentType: order.fulfilmentType,
    subtotal: order.subtotal.toFixed(2),
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddressLine1: order.shippingAddressLine1,
    shippingAddressLine2: order.shippingAddressLine2,
    shippingCity: order.shippingCity,
    shippingProvince: order.shippingProvince,
    shippingPostalCode: order.shippingPostalCode,
    shippingCountry: order.shippingCountry,
    pickupLocation: order.pickupLocation,
    createdAt: order.createdAt.toISOString(),
    confirmedAt: serializeDate(order.confirmedAt),
    processingAt: serializeDate(order.processingAt),
    shippedAt: serializeDate(order.shippedAt),
    readyForPickupAt: serializeDate(order.readyForPickupAt),
    deliveredAt: serializeDate(order.deliveredAt),
    estimatedDeliveryDate: order.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    cancelledAt: serializeDate(order.cancelledAt),
    items: order.items.map((item) => ({
      title: item.title,
      sku: item.sku,
      size: item.size,
      color: item.color,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    })),
  };
}

export async function getCustomerOrderForCurrentUser(orderId: string) {
  const user = await requireUser();

  if (!ORDER_ID_PATTERN.test(orderId)) {
    throw new ApiError("Order not found", 404);
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    select: customerOrderSelect,
  });

  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  return serializeCustomerOrder(order);
}

export type CustomerOrderDetail = Awaited<ReturnType<typeof getCustomerOrderForCurrentUser>>;
