import { requireAdmin } from "@/lib/auth/require-admin";
import { listAdminOrders } from "@/lib/admin/orders/queries";
import { failure, success } from "@/lib/admin/orders/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    return success(await listAdminOrders(new URL(request.url).searchParams));
  } catch (error) { return failure(error); }
}
