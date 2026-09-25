import { requireAdmin } from "@/lib/auth/require-admin";
import { failure, mutationBody, success } from "@/lib/admin/products/http";
import { rejectAdminProductVariantRemoval, updateAdminProductVariant } from "@/lib/admin/products/mutations";

type Context = { params: Promise<{ productId: string; variantId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { productId, variantId } = await context.params;
    return success(await updateAdminProductVariant(productId, variantId, await mutationBody(request)));
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { productId, variantId } = await context.params;
    return success(await rejectAdminProductVariantRemoval(productId, variantId, await mutationBody(request)));
  } catch (error) { return failure(error); }
}
