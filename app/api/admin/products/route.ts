import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminProduct } from "@/lib/admin/products/mutations";
import { listAdminProducts } from "@/lib/admin/products/queries";
import { failure, mutationBody, success } from "@/lib/admin/products/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    return success(await listAdminProducts(new URL(request.url).searchParams));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    return success(await createAdminProduct(await mutationBody(request)), { status: 201 });
  } catch (error) { return failure(error); }
}
