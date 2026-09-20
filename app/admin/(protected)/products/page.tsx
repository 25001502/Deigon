import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Admin products" };

export default async function AdminProductsPage() {
  await requireAdminPage();
  return (
    <>
      <h1 className="text-3xl font-semibold text-ink">Products</h1>
      <p className="mt-3 text-sm leading-6 text-ink/70">Product management is coming in a future update.</p>
    </>
  );
}
