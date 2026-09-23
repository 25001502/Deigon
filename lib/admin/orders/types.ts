import type { FulfilmentType, OrderStatus, PaymentStatus } from "@prisma/client";

export type FulfilmentInput = { expectedStatus: OrderStatus; targetStatus: OrderStatus };
export type EstimateInput = {
  expectedStatus: OrderStatus;
  expectedEstimatedDeliveryDate: string | null;
  estimatedDeliveryDate: string | null;
};
export type OrderListInput = {
  search: string;
  status?: OrderStatus;
  fulfilmentType?: FulfilmentType;
  paymentStatus?: PaymentStatus;
  limit: number;
  filterKey: string;
  cursor?: { createdAt: string; id: string };
};
