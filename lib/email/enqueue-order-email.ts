import "server-only";

import { Prisma, type FulfilmentType, type OrderStatus, type PaymentStatus } from "@prisma/client";

import {
  ORDER_EMAIL_TEMPLATE_VERSION,
  type OrderEmailEventType,
  type OrderEmailSnapshotV1,
} from "./order-email-types";

export const orderEmailSnapshotSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  customerName: true,
  customerEmail: true,
  fulfilmentType: true,
  subtotal: true,
  shippingFee: true,
  total: true,
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
  items: {
    orderBy: { id: "asc" },
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
  },
} satisfies Prisma.OrderSelect;

type SnapshotOrder = Prisma.OrderGetPayload<{ select: typeof orderEmailSnapshotSelect }>;

export class OrderEmailEnqueueInvariantError extends Error {
  constructor() {
    super("Order email lifecycle invariant failed.");
    this.name = "OrderEmailEnqueueInvariantError";
  }
}

function invariant(): never {
  throw new OrderEmailEnqueueInvariantError();
}

function eventMatchesOrder(
  eventType: OrderEmailEventType,
  order: {
    fulfilmentType: FulfilmentType;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    confirmedAt: Date | null;
    processingAt: Date | null;
    shippedAt: Date | null;
    readyForPickupAt: Date | null;
    deliveredAt: Date | null;
  },
): boolean {
  switch (eventType) {
    case "ORDER_CONFIRMED":
      return order.status === "CONFIRMED" && order.paymentStatus === "PAID" && order.confirmedAt !== null;
    case "ORDER_PROCESSING":
      return order.status === "PROCESSING" && order.processingAt !== null;
    case "ORDER_SHIPPED":
      return order.fulfilmentType === "DELIVERY" && order.status === "SHIPPED" && order.shippedAt !== null;
    case "ORDER_READY_FOR_PICKUP":
      return order.fulfilmentType === "PICKUP" && order.status === "READY_FOR_PICKUP" && order.readyForPickupAt !== null;
    case "ORDER_COMPLETED":
      return order.status === "DELIVERED" && order.deliveredAt !== null;
  }
}

function destination(order: SnapshotOrder): OrderEmailSnapshotV1["destination"] {
  if (order.fulfilmentType === "PICKUP") {
    if (!order.pickupLocation) invariant();
    return { type: "PICKUP", pickupLocation: order.pickupLocation };
  }
  if (
    !order.shippingAddressLine1 || !order.shippingCity || !order.shippingProvince ||
    !order.shippingPostalCode || !order.shippingCountry
  ) invariant();
  return {
    type: "DELIVERY",
    addressLine1: order.shippingAddressLine1,
    addressLine2: order.shippingAddressLine2,
    city: order.shippingCity,
    province: order.shippingProvince,
    postalCode: order.shippingPostalCode,
    country: order.shippingCountry,
  };
}

export function buildOrderEmailSnapshotV1(order: SnapshotOrder): OrderEmailSnapshotV1 {
  return {
    version: ORDER_EMAIL_TEMPLATE_VERSION,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customer: { name: order.customerName, email: order.customerEmail },
    fulfilmentType: order.fulfilmentType,
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
    subtotal: order.subtotal.toFixed(2),
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
    destination: destination(order),
    createdAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    processingAt: order.processingAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    readyForPickupAt: order.readyForPickupAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    estimatedDeliveryDate: order.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null,
  };
}

export async function enqueueOrderEmail(
  tx: Prisma.TransactionClient,
  orderId: string,
  eventType: OrderEmailEventType,
  enqueueAt: Date,
): Promise<string> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: orderEmailSnapshotSelect,
  });
  if (!order || !eventMatchesOrder(eventType, order)) invariant();

  const payload = buildOrderEmailSnapshotV1(order);
  const event = await tx.orderEmailOutbox.create({
    data: {
      orderId: order.id,
      eventType,
      status: "PENDING",
      recipientEmail: order.customerEmail,
      recipientName: order.customerName,
      templateVersion: ORDER_EMAIL_TEMPLATE_VERSION,
      payload: payload as unknown as Prisma.InputJsonObject,
      attemptCount: 0,
      nextAttemptAt: enqueueAt,
      claimedAt: null,
      claimToken: null,
      lastAttemptAt: null,
      sentAt: null,
      providerMessageId: null,
      lastErrorCode: null,
      lastError: null,
    },
    select: { id: true },
  });
  return event.id;
}
