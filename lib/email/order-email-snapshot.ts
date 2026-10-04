import "server-only";

import {
  ORDER_EMAIL_TEMPLATE_VERSION,
  type OrderEmailRecipient,
  type OrderEmailSnapshotItemV1,
  type OrderEmailSnapshotV1,
} from "./order-email-types";

const MONEY = /^(?:0|[1-9]\d{0,7})\.\d{2}$/;
const EMAIL_LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class OrderEmailSnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderEmailSnapshotValidationError";
  }
}

function invalid(message: string): never {
  throw new OrderEmailSnapshotValidationError(message);
}

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    invalid(`${label} has an invalid shape.`);
  }
  return result;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") invalid(`${label} must be a string.`);
  const result = value.trim();
  if (!result || result.length > maximum || CONTROL.test(result)) invalid(`${label} is invalid.`);
  return result;
}

function optionalText(value: unknown, label: string, maximum: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximum || CONTROL.test(value)) invalid(`${label} is invalid.`);
  const result = value.trim();
  return result || null;
}

function money(value: unknown, label: string): string {
  if (typeof value !== "string" || !MONEY.test(value)) invalid(`${label} must be an exact decimal string.`);
  return value;
}

function cents(value: string): bigint {
  const [whole, fraction] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction);
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !UTC_TIMESTAMP.test(value)) invalid(`${label} must be a UTC timestamp.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid(`${label} is invalid.`);
  return value;
}

function optionalTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function optionalDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !DATE_ONLY.test(value)) invalid(`${label} must be a date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${label} is invalid.`);
  return value;
}

function email(value: unknown, label: string): string {
  const result = text(value, label, 320);
  const separator = result.indexOf("@");
  const local = result.slice(0, separator);
  const domain = result.slice(separator + 1);
  const labels = domain.split(".");
  if (
    separator <= 0 || separator !== result.lastIndexOf("@") || local.length > 64 || domain.length > 253 ||
    !EMAIL_LOCAL.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
    labels.length < 2 || labels.some((part) => !EMAIL_DOMAIN_LABEL.test(part))
  ) invalid(`${label} is invalid.`);
  return result;
}

export function normalizeOrderEmailRecipient(value: unknown): OrderEmailRecipient {
  const input = record(value, ["recipientEmail", "recipientName"], "recipient");
  return {
    recipientEmail: email(input.recipientEmail, "recipientEmail"),
    recipientName: text(input.recipientName, "recipientName", 200),
  };
}

function item(value: unknown, index: number): OrderEmailSnapshotItemV1 {
  const label = `items[${index}]`;
  const input = record(value, ["title", "sku", "size", "color", "imageUrl", "quantity", "unitPrice", "lineTotal"], label);
  if (!Number.isInteger(input.quantity) || (input.quantity as number) <= 0 || (input.quantity as number) > 1_000_000) {
    invalid(`${label}.quantity is invalid.`);
  }
  const unitPrice = money(input.unitPrice, `${label}.unitPrice`);
  const lineTotal = money(input.lineTotal, `${label}.lineTotal`);
  if (cents(unitPrice) * BigInt(input.quantity as number) !== cents(lineTotal)) invalid(`${label}.lineTotal is inconsistent.`);
  return {
    title: text(input.title, `${label}.title`, 500),
    sku: text(input.sku, `${label}.sku`, 200),
    size: optionalText(input.size, `${label}.size`, 100),
    color: optionalText(input.color, `${label}.color`, 100),
    imageUrl: optionalText(input.imageUrl, `${label}.imageUrl`, 2048),
    quantity: input.quantity as number,
    unitPrice,
    lineTotal,
  };
}

export function parseOrderEmailSnapshotV1(value: unknown): OrderEmailSnapshotV1 {
  const input = record(value, [
    "version", "orderId", "orderNumber", "customer", "fulfilmentType", "items",
    "subtotal", "shippingFee", "total", "destination", "createdAt", "confirmedAt",
    "processingAt", "shippedAt", "readyForPickupAt", "deliveredAt", "estimatedDeliveryDate",
  ], "snapshot");
  if (input.version !== ORDER_EMAIL_TEMPLATE_VERSION) invalid("snapshot.version is invalid.");
  if (input.fulfilmentType !== "DELIVERY" && input.fulfilmentType !== "PICKUP") invalid("snapshot.fulfilmentType is invalid.");
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 200) invalid("snapshot.items is invalid.");

  const customer = record(input.customer, ["name", "email"], "snapshot.customer");
  const items = input.items.map(item);
  const subtotal = money(input.subtotal, "snapshot.subtotal");
  const shippingFee = money(input.shippingFee, "snapshot.shippingFee");
  const total = money(input.total, "snapshot.total");
  if (items.reduce((sum, line) => sum + cents(line.lineTotal), BigInt(0)) !== cents(subtotal)) invalid("snapshot.subtotal is inconsistent.");
  if (cents(subtotal) + cents(shippingFee) !== cents(total)) invalid("snapshot.total is inconsistent.");

  const destination = input.fulfilmentType === "DELIVERY"
    ? (() => {
        const result = record(input.destination, ["type", "addressLine1", "addressLine2", "city", "province", "postalCode", "country"], "snapshot.destination");
        if (result.type !== "DELIVERY") invalid("snapshot.destination is inconsistent.");
        return {
          type: "DELIVERY" as const,
          addressLine1: text(result.addressLine1, "snapshot.destination.addressLine1", 300),
          addressLine2: optionalText(result.addressLine2, "snapshot.destination.addressLine2", 300),
          city: text(result.city, "snapshot.destination.city", 150),
          province: text(result.province, "snapshot.destination.province", 150),
          postalCode: text(result.postalCode, "snapshot.destination.postalCode", 40),
          country: text(result.country, "snapshot.destination.country", 150),
        };
      })()
    : (() => {
        const result = record(input.destination, ["type", "pickupLocation"], "snapshot.destination");
        if (result.type !== "PICKUP") invalid("snapshot.destination is inconsistent.");
        return {
          type: "PICKUP" as const,
          pickupLocation: text(result.pickupLocation, "snapshot.destination.pickupLocation", 500),
        };
      })();

  return {
    version: ORDER_EMAIL_TEMPLATE_VERSION,
    orderId: text(input.orderId, "snapshot.orderId", 200),
    orderNumber: text(input.orderNumber, "snapshot.orderNumber", 100),
    customer: {
      name: text(customer.name, "snapshot.customer.name", 200),
      email: email(customer.email, "snapshot.customer.email"),
    },
    fulfilmentType: input.fulfilmentType,
    items,
    subtotal,
    shippingFee,
    total,
    destination,
    createdAt: timestamp(input.createdAt, "snapshot.createdAt"),
    confirmedAt: optionalTimestamp(input.confirmedAt, "snapshot.confirmedAt"),
    processingAt: optionalTimestamp(input.processingAt, "snapshot.processingAt"),
    shippedAt: optionalTimestamp(input.shippedAt, "snapshot.shippedAt"),
    readyForPickupAt: optionalTimestamp(input.readyForPickupAt, "snapshot.readyForPickupAt"),
    deliveredAt: optionalTimestamp(input.deliveredAt, "snapshot.deliveredAt"),
    estimatedDeliveryDate: optionalDate(input.estimatedDeliveryDate, "snapshot.estimatedDeliveryDate"),
  };
}
