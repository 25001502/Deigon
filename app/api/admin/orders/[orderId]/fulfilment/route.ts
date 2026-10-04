import { after } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { transitionAdminOrder } from "@/lib/admin/orders/mutations";
import { failure, mutationBody, success } from "@/lib/admin/orders/http";
import { dispatchOrderEmails } from "@/lib/email/dispatch-order-emails";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    await requireAdmin();
    const { orderId } = await context.params;
    const result = await transitionAdminOrder(orderId, await mutationBody(request));
    after(async () => {
      try {
        const summary = await dispatchOrderEmails({ limit: 1 });
        if (summary.dead > 0) {
          console.error("Order email background dispatch dead-lettered events.", {
            examined: summary.examined,
            dead: summary.dead,
          });
        }
      } catch {
        console.error("Order email background dispatch failed.");
      }
    });
    return success(result);
  } catch (error) { return failure(error); }
}
