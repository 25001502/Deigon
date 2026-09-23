import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ApiError } from "@/lib/api/errors";
import { canTransition, consistentMilestones, milestoneFields } from "@/lib/orders/fulfilment";
import { estimateInput, fulfilmentInput, johannesburgToday, orderId } from "./input";
import { dateOnly, detailSelect, serializeDetail } from "./serialize";

const mutationSelect = { ...detailSelect, inventoryReleasedAt: true } satisfies Prisma.OrderSelect;
function conflict(): never { throw new ApiError("Order state changed or is not eligible for this action", 409); }

async function lockedOrder(tx: Prisma.TransactionClient, id: string) {
  // Only Order is locked. A Payment lock here would invert the webhook lock order.
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id }, select: mutationSelect });
  if (!order) throw new ApiError("Order not found", 404);
  if (!order.payment || order.paymentStatus !== "PAID" || order.payment.status !== "PAID"
    || !order.confirmedAt || order.cancelledAt || order.inventoryReleasedAt
    || !order.payment.amount.equals(order.total) || !consistentMilestones(order)) conflict();
  return order;
}

const transactionOptions = { maxWait: 5000, timeout: 10000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

export async function transitionAdminOrder(id: string, value: unknown) {
  await requireAdmin();
  const validId = orderId(id);
  const input = fulfilmentInput(value);
  return prisma.$transaction(async (tx) => {
    const order = await lockedOrder(tx, validId);
    if (!canTransition(order.fulfilmentType, input.expectedStatus, input.targetStatus)) conflict();
    const field = milestoneFields[input.targetStatus];
    if (order.status === input.targetStatus && order[field]) return serializeDetail(order);
    if (order.status !== input.expectedStatus || order[field]) conflict();
    const now = new Date();
    // Fail closed if corrupt/future milestones would make the new history inconsistent.
    if (!consistentMilestones({ ...order, status: input.targetStatus, [field]: now })) conflict();
    const updated = await tx.order.update({
      where: { id: validId }, data: { status: input.targetStatus, [field]: now }, select: detailSelect,
    });
    return serializeDetail(updated);
  }, transactionOptions);
}

export async function setAdminOrderEstimate(id: string, value: unknown) {
  await requireAdmin();
  const validId = orderId(id);
  const input = estimateInput(value);
  return prisma.$transaction(async (tx) => {
    const order = await lockedOrder(tx, validId);
    if (order.fulfilmentType !== "DELIVERY" || !["CONFIRMED", "PROCESSING", "SHIPPED"].includes(order.status)
      || order.status !== input.expectedStatus) conflict();
    const current = dateOnly(order.estimatedDeliveryDate);
    if (current === input.estimatedDeliveryDate) return serializeDetail(order);
    if (current !== input.expectedEstimatedDeliveryDate) conflict();
    if (input.estimatedDeliveryDate && input.estimatedDeliveryDate < johannesburgToday()) {
      throw new ApiError("Estimated delivery date must be today or later", 400);
    }
    const updated = await tx.order.update({
      where: { id: validId },
      data: { estimatedDeliveryDate: input.estimatedDeliveryDate ? new Date(`${input.estimatedDeliveryDate}T00:00:00.000Z`) : null },
      select: detailSelect,
    });
    return serializeDetail(updated);
  }, transactionOptions);
}
