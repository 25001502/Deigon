import { AccountDashboard } from "@/components/account/account-dashboard";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const user = await requireUser().catch(() => redirect("/login"));

  const [profile, addresses, orders] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, phone: true, role: true } }),
    prisma.address.findMany({ where: { userId: user.id }, orderBy: { id: "desc" } }),
    prisma.order.findMany({ where: { userId: user.id }, select: { id: true, orderNumber: true, status: true, total: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!profile) redirect("/login");

  return <AccountDashboard profile={profile} addresses={addresses} orders={orders.map((order) => ({ ...order, total: order.total.toString() }))} />;
}

