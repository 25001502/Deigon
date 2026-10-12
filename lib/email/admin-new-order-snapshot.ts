import "server-only";

import { normalizeOrderEmailRecipient, OrderEmailSnapshotValidationError } from "./order-email-snapshot";
import { ORDER_EMAIL_TEMPLATE_VERSION, type OrderEmailRecipient } from "./order-email-types";

export type AdminNewOrderSnapshotV1 = {
  version: typeof ORDER_EMAIL_TEMPLATE_VERSION;
  orderId: string;
  orderNumber: string;
  confirmedAt: string;
  total: string;
  fulfilmentType: "DELIVERY" | "PICKUP";
  items: Array<{ title: string; quantity: number; size: string | null; color: string | null }>;
  customer: { name: string; email: string; phone: string | null };
  recipient: OrderEmailRecipient;
};

function invalid(): never {
  throw new OrderEmailSnapshotValidationError("Admin new-order snapshot is invalid.");
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const input = value as Record<string, unknown>;
  const actual = Object.keys(input);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) invalid();
  return input;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value.trim();
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value.trim() || null;
}

export function parseAdminNewOrderSnapshotV1(value: unknown): AdminNewOrderSnapshotV1 {
  const input = record(value, [
    "version", "orderId", "orderNumber", "confirmedAt", "total",
    "fulfilmentType", "items", "customer", "recipient",
  ]);
  if (input.version !== ORDER_EMAIL_TEMPLATE_VERSION) invalid();
  if (input.fulfilmentType !== "DELIVERY" && input.fulfilmentType !== "PICKUP") invalid();
  if (typeof input.total !== "string" || !/^(?:0|[1-9]\d{0,7})\.\d{2}$/.test(input.total)) invalid();
  const confirmedAt = text(input.confirmedAt, 50);
  const confirmedDate = new Date(confirmedAt);
  if (!Number.isFinite(confirmedDate.getTime()) || confirmedDate.toISOString() !== confirmedAt) invalid();
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 200) invalid();
  const items = input.items.map((value) => {
    const item = record(value, ["title", "quantity", "size", "color"]);
    if (!Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 1_000_000) invalid();
    return {
      title: text(item.title, 500), quantity: item.quantity as number,
      size: optionalText(item.size, 100), color: optionalText(item.color, 100),
    };
  });
  const customer = record(input.customer, ["name", "email", "phone"]);
  const recipient = normalizeOrderEmailRecipient(input.recipient);
  if (recipient.recipientEmail !== recipient.recipientEmail.toLowerCase()) invalid();
  return {
    version: ORDER_EMAIL_TEMPLATE_VERSION,
    orderId: text(input.orderId, 200), orderNumber: text(input.orderNumber, 100),
    confirmedAt, total: input.total, fulfilmentType: input.fulfilmentType,
    items,
    customer: {
      name: text(customer.name, 200),
      email: text(customer.email, 320),
      phone: optionalText(customer.phone, 50),
    },
    recipient,
  };
}
