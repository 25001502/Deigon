import { AdminInventoryDetail } from "@/components/admin/inventory/admin-inventory-detail";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Inventory adjustment" };

export default async function AdminInventoryDetailPage({ params }: { params: Promise<{ variantId: string }> }) {
  await requireAdminPage();
  const { variantId } = await params;
  return <AdminInventoryDetail variantId={variantId} />;
}
