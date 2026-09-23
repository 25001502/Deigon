import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminOrder } from "@/lib/admin/orders/queries";
import { failure, success } from "@/lib/admin/orders/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    await requireAdmin();
    const { orderId } = await context.params;
    return success(await getAdminOrder(orderId));
  } catch (error) { return failure(error); }
}
