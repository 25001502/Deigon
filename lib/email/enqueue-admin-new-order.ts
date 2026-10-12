import "server-only";

import { Prisma } from "@prisma/client";

import { normalizeOrderEmailRecipient } from "./order-email-snapshot";
import { ORDER_EMAIL_TEMPLATE_VERSION } from "./order-email-types";
import type { AdminNewOrderSnapshotV1 } from "./admin-new-order-snapshot";

export type AdminNewOrderEnqueueSummary = {
  availableAdmins: number;
  enqueued: number;
  skippedRecipients: number;
  preparationFailed: boolean;
};

/** A savepoint keeps notification-specific failures from undoing a paid order. */
export async function enqueueAdminNewOrderEmails(
  tx: Prisma.TransactionClient,
  orderId: string,
  enqueueAt: Date,
): Promise<AdminNewOrderEnqueueSummary> {
  const summary: AdminNewOrderEnqueueSummary = {
    availableAdmins: 0,
    enqueued: 0,
    skippedRecipients: 0,
    preparationFailed: false,
  };
  await tx.$executeRaw`SAVEPOINT deigon_admin_new_order_email`;
  try {
    const admins = await tx.user.findMany({
      where: { role: "ADMIN" },
      select: { email: true, name: true },
      orderBy: { id: "asc" },
    });
    summary.availableAdmins = admins.length;
    const recipients = new Map<string, { recipientEmail: string; recipientName: string }>();
    for (const admin of admins) {
      try {
        const recipient = normalizeOrderEmailRecipient({
          recipientEmail: admin.email.trim().toLowerCase(),
          recipientName: admin.name?.trim() || "DEIGON Admin",
        });
        if (recipients.has(recipient.recipientEmail)) {
          summary.skippedRecipients += 1;
        } else {
          recipients.set(recipient.recipientEmail, recipient);
        }
      } catch {
        summary.skippedRecipients += 1;
      }
    }

    if (recipients.size > 0) {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          fulfilmentType: true,
          total: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          confirmedAt: true,
          items: {
            orderBy: { id: "asc" },
            select: { title: true, quantity: true, size: true, color: true },
          },
        },
      });
      if (!order || order.status !== "CONFIRMED" || order.paymentStatus !== "PAID" || !order.confirmedAt) {
        throw new Error("Admin new-order email requires a confirmed paid order.");
      }
      for (const recipient of recipients.values()) {
        await tx.$executeRaw`SAVEPOINT deigon_admin_new_order_email_recipient`;
        try {
          const payload: AdminNewOrderSnapshotV1 = {
            version: ORDER_EMAIL_TEMPLATE_VERSION,
            orderId: order.id,
            orderNumber: order.orderNumber,
            confirmedAt: order.confirmedAt.toISOString(),
            total: order.total.toFixed(2),
            fulfilmentType: order.fulfilmentType,
            items: order.items.map((item) => ({
              title: item.title,
              quantity: item.quantity,
              size: item.size,
              color: item.color,
            })),
            customer: {
              name: order.customerName,
              email: order.customerEmail,
              phone: order.customerPhone,
            },
            recipient,
          };
          await tx.orderEmailOutbox.create({
            data: {
              orderId,
              eventType: "ADMIN_NEW_ORDER",
              recipientKey: recipient.recipientEmail,
              recipientEmail: recipient.recipientEmail,
              recipientName: recipient.recipientName,
              templateVersion: ORDER_EMAIL_TEMPLATE_VERSION,
              payload: payload as unknown as Prisma.InputJsonObject,
              nextAttemptAt: enqueueAt,
            },
          });
          await tx.$executeRaw`RELEASE SAVEPOINT deigon_admin_new_order_email_recipient`;
          summary.enqueued += 1;
        } catch {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT deigon_admin_new_order_email_recipient`;
          await tx.$executeRaw`RELEASE SAVEPOINT deigon_admin_new_order_email_recipient`;
          summary.skippedRecipients += 1;
        }
      }
    }
    await tx.$executeRaw`RELEASE SAVEPOINT deigon_admin_new_order_email`;
    return summary;
  } catch {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT deigon_admin_new_order_email`;
    await tx.$executeRaw`RELEASE SAVEPOINT deigon_admin_new_order_email`;
    return { ...summary, enqueued: 0, preparationFailed: true };
  }
}
