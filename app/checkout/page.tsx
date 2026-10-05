import { CheckoutPreview } from "@/components/checkout/checkout-preview";
import { redirect } from "next/navigation";

import { authPathFor } from "@/lib/auth/safe-callback-path";
import { AuthError, requireUser } from "@/lib/auth/require-user";

export default async function CheckoutPage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      redirect(authPathFor("signup", "/checkout"));
    }
    throw error;
  }

  return <CheckoutPreview />;
}
