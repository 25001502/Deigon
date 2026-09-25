import { AdminProductCreateForm } from "@/components/admin/products/admin-product-form";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Create product" };

export default async function AdminCreateProductPage() {
  await requireAdminPage();
  return <AdminProductCreateForm />;
}
