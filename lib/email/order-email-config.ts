import "server-only";

import { normalizeOrderEmailAppOrigin, OrderEmailRenderError } from "./render-order-email";

export class OrderEmailDispatcherConfigurationError extends Error {
  constructor() {
    super("Order email dispatcher is not configured.");
    this.name = "OrderEmailDispatcherConfigurationError";
  }
}

export function getOrderEmailAppOrigin(): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) throw new OrderEmailDispatcherConfigurationError();
  try {
    return normalizeOrderEmailAppOrigin(configured);
  } catch (error) {
    if (error instanceof OrderEmailRenderError) throw new OrderEmailDispatcherConfigurationError();
    throw error;
  }
}
