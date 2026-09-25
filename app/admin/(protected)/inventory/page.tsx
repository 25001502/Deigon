import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { AdminInventoryList } from "@/components/admin/inventory/admin-inventory-list";

export const metadata = { title: "Admin inventory" };

export default async function AdminInventoryPage() {
  await requireAdminPage();
  return <AdminInventoryList />;
}
