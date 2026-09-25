import { requireAdmin } from "@/lib/auth/require-admin";
import { failure, success } from "@/lib/admin/inventory/http";
import { getAdminInventory } from "@/lib/admin/inventory/queries";

type Context = { params: Promise<{ variantId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    const { variantId } = await context.params;
    return success(await getAdminInventory(variantId));
  } catch (error) { return failure(error); }
}
