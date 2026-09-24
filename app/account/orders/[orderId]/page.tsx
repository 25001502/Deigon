import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CustomerOrderDetailView } from "@/components/account/orders/customer-order-detail";
import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Order details",
};

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireUser().catch(() => redirect("/login"));
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-gray-50/70 px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <CustomerOrderDetailView orderId={orderId} />
      </div>
    </main>
  );
}
