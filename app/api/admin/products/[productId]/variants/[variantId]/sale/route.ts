import { requireAdmin } from "@/lib/auth/require-admin";
import { failure, mutationBody, success } from "@/lib/admin/products/http";
import { updateAdminProductVariantSale } from "@/lib/admin/products/sale/mutations";
import { getAdminProductVariantSale } from "@/lib/admin/products/sale/queries";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ productId: string; variantId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    const { productId, variantId } = await context.params;
    return success(await getAdminProductVariantSale(productId, variantId));
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { productId, variantId } = await context.params;
    return success(await updateAdminProductVariantSale(productId, variantId, await mutationBody(request)));
  } catch (error) { return failure(error); }
}
