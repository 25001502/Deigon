import { requireAdmin } from "@/lib/auth/require-admin";
import { failure, mutationBody, success } from "@/lib/admin/inventory/http";
import { adjustAdminInventory } from "@/lib/admin/inventory/mutations";
import { listAdminInventoryAdjustments } from "@/lib/admin/inventory/queries";

type Context = { params: Promise<{ variantId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { variantId } = await context.params;
    return success(await listAdminInventoryAdjustments(variantId, new URL(request.url).searchParams));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { variantId } = await context.params;
    return success(await adjustAdminInventory(variantId, await mutationBody(request)));
  } catch (error) { return failure(error); }
}
