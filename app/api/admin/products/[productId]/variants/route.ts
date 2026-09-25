import { requireAdmin } from "@/lib/auth/require-admin";
import { failure, mutationBody, success } from "@/lib/admin/products/http";
import { createAdminProductVariant } from "@/lib/admin/products/mutations";

type Context = { params: Promise<{ productId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    await requireAdmin();
    const { productId } = await context.params;
    return success(await createAdminProductVariant(productId, await mutationBody(request)), { status: 201 });
  } catch (error) { return failure(error); }
}
