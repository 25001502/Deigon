import { AccountSignInForm } from "@/components/storefront/account-sign-in-form";
import { storeInfo } from "@/lib/data/catalog";

export const metadata = {
  title: "Account",
};

export default function AccountPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
      <p className="mt-2 text-sm text-gray-600">Customer accounts are launching soon.</p>

      <AccountSignInForm />

      <p className="mt-6 text-xs leading-6 text-gray-500">
        Need help with an order? Email us at{" "}
        <a href={`mailto:${storeInfo.email}`} className="underline">
          {storeInfo.email}
        </a>{" "}
        or call {storeInfo.phone}.
      </p>
    </main>
  );
}

