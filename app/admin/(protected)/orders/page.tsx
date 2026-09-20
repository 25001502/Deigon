import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Admin orders" };

export default async function AdminOrdersPage() {
  await requireAdminPage();
  return (
    <>
      <h1 className="text-3xl font-semibold text-ink">Orders</h1>
      <p className="mt-3 text-sm leading-6 text-ink/70">Order management is coming in a future update.</p>
    </>
  );
}
