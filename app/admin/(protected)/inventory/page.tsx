import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Admin inventory" };

export default async function AdminInventoryPage() {
  await requireAdminPage();
  return (
    <>
      <h1 className="text-3xl font-semibold text-ink">Inventory</h1>
      <p className="mt-3 text-sm leading-6 text-ink/70">Inventory management is coming in a future update.</p>
    </>
  );
}
