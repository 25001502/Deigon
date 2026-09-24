import { AdminOrderDetailView } from "@/components/admin/orders/admin-order-detail";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Admin order details" };

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requireAdminPage();
  const { orderId } = await params;
  return <AdminOrderDetailView orderId={orderId} />;
}
