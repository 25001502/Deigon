import "server-only";
import type { Prisma } from "@prisma/client";

export const listSelect = {
  id: true, orderNumber: true, customerName: true, customerEmail: true,
  createdAt: true, total: true, paymentStatus: true, fulfilmentType: true, status: true,
} satisfies Prisma.OrderSelect;

export const detailSelect = {
  ...listSelect,
  confirmedAt: true, processingAt: true, shippedAt: true, readyForPickupAt: true,
  deliveredAt: true, estimatedDeliveryDate: true, cancelledAt: true, cancelReason: true,
  customerPhone: true, shippingAddressLine1: true, shippingAddressLine2: true,
  shippingCity: true, shippingProvince: true, shippingPostalCode: true, shippingCountry: true,
  pickupLocation: true, subtotal: true, shippingFee: true,
  items: { orderBy: { id: "asc" }, select: {
    title: true, sku: true, size: true, color: true, imageUrl: true,
    quantity: true, unitPrice: true, lineTotal: true,
  } },
  payment: { select: { provider: true, amount: true, status: true } },
} satisfies Prisma.OrderSelect;

type ListRow = Prisma.OrderGetPayload<{ select: typeof listSelect }>;
type DetailRow = Prisma.OrderGetPayload<{ select: typeof detailSelect }>;
export const dateOnly = (value: Date | null): string | null => value?.toISOString().slice(0, 10) ?? null;
const timestamp = (value: Date | null): string | null => value?.toISOString() ?? null;

export function serializeList(row: ListRow) {
  return {
    id: row.id, orderNumber: row.orderNumber, customerName: row.customerName,
    customerEmail: row.customerEmail, createdAt: row.createdAt.toISOString(),
    total: row.total.toFixed(2), paymentStatus: row.paymentStatus,
    fulfilmentType: row.fulfilmentType, status: row.status,
  };
}

export function serializeDetail(row: DetailRow) {
  return {
    ...serializeList(row),
    confirmedAt: timestamp(row.confirmedAt), processingAt: timestamp(row.processingAt),
    shippedAt: timestamp(row.shippedAt), readyForPickupAt: timestamp(row.readyForPickupAt),
    deliveredAt: timestamp(row.deliveredAt), estimatedDeliveryDate: dateOnly(row.estimatedDeliveryDate),
    cancelledAt: timestamp(row.cancelledAt), cancelReason: row.cancelReason,
    customerPhone: row.customerPhone, shippingAddressLine1: row.shippingAddressLine1,
    shippingAddressLine2: row.shippingAddressLine2, shippingCity: row.shippingCity,
    shippingProvince: row.shippingProvince, shippingPostalCode: row.shippingPostalCode,
    shippingCountry: row.shippingCountry, pickupLocation: row.pickupLocation,
    subtotal: row.subtotal.toFixed(2), shippingFee: row.shippingFee.toFixed(2),
    items: row.items.map((item) => ({
      title: item.title, sku: item.sku, size: item.size, color: item.color,
      imageUrl: item.imageUrl, quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2), lineTotal: item.lineTotal.toFixed(2),
    })),
    payment: row.payment ? {
      provider: row.payment.provider, amount: row.payment.amount.toFixed(2), status: row.payment.status,
    } : null,
  };
}

export type AdminOrderListItem = ReturnType<typeof serializeList>;
export type AdminOrderDetail = ReturnType<typeof serializeDetail>;
