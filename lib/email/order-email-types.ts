import "server-only";

export const ORDER_EMAIL_TEMPLATE_VERSION = 1 as const;

export const ORDER_EMAIL_EVENT_TYPES = [
  "ORDER_CONFIRMED",
  "ORDER_PROCESSING",
  "ORDER_SHIPPED",
  "ORDER_READY_FOR_PICKUP",
  "ORDER_COMPLETED",
] as const;

export type OrderEmailEventType = (typeof ORDER_EMAIL_EVENT_TYPES)[number];

export const ORDER_EMAIL_STATUSES = ["PENDING", "SENDING", "SENT", "DEAD"] as const;

export type OrderEmailStatus = (typeof ORDER_EMAIL_STATUSES)[number];

export type OrderEmailRecipient = {
  recipientEmail: string;
  recipientName: string;
};

export type OrderEmailSnapshotItemV1 = {
  title: string;
  sku: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

export type OrderEmailDeliveryDestinationV1 = {
  type: "DELIVERY";
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export type OrderEmailPickupDestinationV1 = {
  type: "PICKUP";
  pickupLocation: string;
};

export type OrderEmailSnapshotV1 = {
  version: typeof ORDER_EMAIL_TEMPLATE_VERSION;
  orderId: string;
  orderNumber: string;
  customer: {
    name: string;
    email: string;
  };
  fulfilmentType: "DELIVERY" | "PICKUP";
  items: OrderEmailSnapshotItemV1[];
  subtotal: string;
  shippingFee: string;
  total: string;
  destination: OrderEmailDeliveryDestinationV1 | OrderEmailPickupDestinationV1;
  createdAt: string;
  confirmedAt: string | null;
  processingAt: string | null;
  shippedAt: string | null;
  readyForPickupAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryDate: string | null;
};
