import "server-only";

import { parseOrderEmailSnapshotV1 } from "./order-email-snapshot";
import {
  ORDER_EMAIL_EVENT_TYPES,
  ORDER_EMAIL_TEMPLATE_VERSION,
  type OrderEmailEventType,
} from "./order-email-types";
import { renderOrderEmailV1, type RenderedOrderEmail } from "./templates/order-email-v1";

export type RenderOrderEmailInput = {
  eventType: OrderEmailEventType;
  templateVersion: number;
  payload: unknown;
  appOrigin: string;
};

export class OrderEmailRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderEmailRenderError";
  }
}

export function normalizeOrderEmailAppOrigin(value: string): string {
  let url: URL;
  try {
    if (typeof value !== "string") throw new Error("Invalid origin type.");
    url = new URL(value.trim());
  } catch {
    throw new OrderEmailRenderError("Application origin is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new OrderEmailRenderError("Application origin is invalid.");
  }
  return url.origin;
}

export function renderOrderEmail(input: RenderOrderEmailInput): RenderedOrderEmail {
  if (input.templateVersion !== ORDER_EMAIL_TEMPLATE_VERSION) {
    throw new OrderEmailRenderError("Order email template version is unsupported.");
  }
  if (!(ORDER_EMAIL_EVENT_TYPES as readonly string[]).includes(input.eventType)) {
    throw new OrderEmailRenderError("Order email event type is unsupported.");
  }
  const payload = parseOrderEmailSnapshotV1(input.payload);
  if (payload.version !== input.templateVersion) {
    throw new OrderEmailRenderError("Order email template version does not match its payload.");
  }
  return renderOrderEmailV1({
    eventType: input.eventType,
    payload,
    appOrigin: normalizeOrderEmailAppOrigin(input.appOrigin),
  });
}
