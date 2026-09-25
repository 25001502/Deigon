import { requireAdmin } from "@/lib/auth/require-admin";
import { failure, mutationBody, success } from "@/lib/admin/products/http";
import { archiveAdminProduct, updateAdminProduct } from "@/lib/admin/products/mutations";
import { getAdminProduct } from "@/lib/admin/products/queries";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ productId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    const { productId } = await context.params;
    return success(await getAdminProduct(productId));
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { productId } = await context.params;
    return success(await updateAdminProduct(productId, await mutationBody(request)));
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { productId } = await context.params;
    return success(await archiveAdminProduct(productId, await mutationBody(request)));
  } catch (error) { return failure(error); }
}
