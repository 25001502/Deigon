import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { AdminOrdersList } from "@/components/admin/orders/admin-orders-list";

export const metadata = { title: "Admin orders" };

export default async function AdminOrdersPage() {
  await requireAdminPage();
  return <AdminOrdersList />;
}
