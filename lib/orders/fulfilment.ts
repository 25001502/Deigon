import type { FulfilmentType, OrderStatus } from "@prisma/client";

export const milestoneFields = {
  PROCESSING: "processingAt",
  SHIPPED: "shippedAt",
  READY_FOR_PICKUP: "readyForPickupAt",
  DELIVERED: "deliveredAt",
} as const;

export type FulfilmentTarget = keyof typeof milestoneFields;

const paths: Record<FulfilmentType, readonly OrderStatus[]> = {
  DELIVERY: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"],
  PICKUP: ["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP", "DELIVERED"],
};

export function canTransition(type: string, from: string, to: string): to is FulfilmentTarget {
  const path = type === "DELIVERY" ? paths.DELIVERY : type === "PICKUP" ? paths.PICKUP : [];
  const index = path.indexOf(from as OrderStatus);
  return index >= 0 && index < path.length - 1 && path[index + 1] === to;
}

/** Historical missing milestones are valid; future/opposite-branch ones are not. */
export function consistentMilestones(order: {
  fulfilmentType: FulfilmentType;
  status: OrderStatus;
  confirmedAt: Date | null;
  processingAt: Date | null;
  shippedAt: Date | null;
  readyForPickupAt: Date | null;
  deliveredAt: Date | null;
}): boolean {
  const path = paths[order.fulfilmentType];
  const current = path?.indexOf(order.status) ?? -1;
  if (current < 0) return false;
  let previous = order.confirmedAt;
  for (const [status, field] of Object.entries(milestoneFields)) {
    const value = order[field];
    const index = path.indexOf(status as OrderStatus);
    if (value && (index < 0 || index > current)) return false;
  }
  for (const status of path.slice(1, current + 1)) {
    const value = order[milestoneFields[status as FulfilmentTarget]];
    if (!value) continue;
    if (previous && value < previous) return false;
    previous = value;
  }
  return true;
}
