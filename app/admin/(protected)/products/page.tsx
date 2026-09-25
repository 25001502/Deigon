import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { AdminProductsList } from "@/components/admin/products/admin-products-list";

export const metadata = { title: "Admin products" };

export default async function AdminProductsPage() {
  await requireAdminPage();
  return <AdminProductsList />;
}
