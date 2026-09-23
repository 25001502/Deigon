import { requireAdmin } from "@/lib/auth/require-admin";
import { transitionAdminOrder } from "@/lib/admin/orders/mutations";
import { failure, mutationBody, success } from "@/lib/admin/orders/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    await requireAdmin();
    const { orderId } = await context.params;
    return success(await transitionAdminOrder(orderId, await mutationBody(request)));
  } catch (error) { return failure(error); }
}
