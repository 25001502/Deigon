import { requireAdmin } from "@/lib/auth/require-admin";
import { failure, success } from "@/lib/admin/inventory/http";
import { listAdminInventory } from "@/lib/admin/inventory/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    return success(await listAdminInventory(new URL(request.url).searchParams));
  } catch (error) { return failure(error); }
}
