import { AdminProductEditForm } from "@/components/admin/products/admin-product-form";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Edit product" };

export default async function AdminEditProductPage({ params }: { params: Promise<{ productId: string }> }) {
  await requireAdminPage();
  const { productId } = await params;
  return <AdminProductEditForm productId={productId} />;
}
