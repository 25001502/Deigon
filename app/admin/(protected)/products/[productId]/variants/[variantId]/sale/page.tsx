import { AdminSalePricing } from "@/components/admin/products/sale/admin-sale-pricing";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export const metadata = { title: "Sale pricing" };

export default async function AdminSalePricingPage({
  params,
}: {
  params: Promise<{ productId: string; variantId: string }>;
}) {
  await requireAdminPage();
  const { productId, variantId } = await params;
  return <AdminSalePricing productId={productId} variantId={variantId} />;
}
