import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { AdminDashboard } from "@/components/admin/dashboard/admin-dashboard";
import { getAdminDashboardData } from "@/lib/admin/dashboard/queries";

export const metadata = { title: "Admin dashboard" };

export default async function AdminDashboardPage() {
  await requireAdminPage();
  const data = await getAdminDashboardData();
  return <AdminDashboard data={data} />;
}
