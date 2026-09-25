import { requireAdmin } from "@/lib/auth/require-admin";
import { failure, success } from "@/lib/admin/products/http";
import { listAdminProductCategories } from "@/lib/admin/products/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return success(await listAdminProductCategories());
  } catch (error) { return failure(error); }
}
