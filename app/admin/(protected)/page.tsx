import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Admin dashboard" };

export default async function AdminDashboardPage() {
  await requireAdminPage();
  return (
    <>
      <h1 className="text-3xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-3 text-sm leading-6 text-ink/70">Welcome to your DEIGON admin workspace. Management tools will be available in a future update.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {["Orders", "Products", "Inventory"].map((title) => (
          <section key={title} className="rounded-xl border border-ink/10 bg-paper p-5">
            <h2 className="font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">Coming soon</p>
          </section>
        ))}
      </div>
    </>
  );
}
