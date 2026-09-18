import { PaymentReturnStatus } from "@/components/checkout/payment-return-status";

type PaymentReturnPageProps = {
  searchParams: Promise<{ orderId?: string | string[] }>;
};

export default async function PaymentCancelPage({ searchParams }: PaymentReturnPageProps) {
  const { orderId } = await searchParams;

  return (
    <PaymentReturnStatus
      kind="cancel"
      orderId={typeof orderId === "string" ? orderId : null}
    />
  );
}
