import Link from "next/link";

import { PolicyPage, PolicySection } from "@/components/storefront/policy-page";
import { storeInfo } from "@/lib/data/catalog";

export const metadata = {
  title: "Refund Policy",
};

export default function RefundPolicyPage() {
  return (
    <PolicyPage title="Refund policy">
      <PolicySection>
        <p>
          We have a 30-day return policy, which means you have 30 days after receiving your item to request a
          return.
        </p>
        <p>
          To be eligible for a return, your item must be in the same condition that you received it, unworn or
          unused, with tags, and in its original packaging. You&apos;ll also need the receipt or proof of purchase.
        </p>
        <p>
          To start a return, you can contact us at{" "}
          <a href={`mailto:${storeInfo.email}`} className="underline">
            {storeInfo.email}
          </a>
          . If your return is accepted, we&apos;ll send you a return shipping label, as well as instructions on how
          and where to send your package. Items sent back to us without first requesting a return will not be
          accepted.
        </p>
      </PolicySection>

      <PolicySection heading="Damages and issues">
        <p>
          Please inspect your order upon reception and contact us immediately if the item is defective, damaged, or
          if you receive the wrong item, so that we can evaluate the issue and make it right.
        </p>
      </PolicySection>

      <PolicySection heading="Exceptions / non-returnable items">
        <p>
          Certain types of items cannot be returned, like custom or personalised products and personal care goods.
          We also do not accept returns for hazardous materials, flammable liquids, or gases. Please get in touch if
          you have questions about your specific item. We cannot accept returns on sale items or gift cards.
        </p>
      </PolicySection>

      <PolicySection heading="Exchanges">
        <p>
          The fastest way to ensure you get what you want is to return the item you have, and once the return is
          accepted, make a separate purchase for the new item.
        </p>
      </PolicySection>

      <PolicySection heading="Refunds">
        <p>
          We will notify you once we&apos;ve received and inspected your return, and let you know if the refund was
          approved. If approved, you&apos;ll be automatically refunded on your original payment method within 10
          business days. Please remember it can take some time for your bank or card provider to process and post
          the refund.
        </p>
        <p>
          If more than 15 business days have passed since we&apos;ve approved your return, please contact us at{" "}
          <a href={`mailto:${storeInfo.email}`} className="underline">
            {storeInfo.email}
          </a>
          .
        </p>
      </PolicySection>

      <PolicySection heading="Contact">
        <p>
          {storeInfo.legalName}
          <br />
          {storeInfo.email} · {storeInfo.phone}
        </p>
        <p>
          See also our <Link href="/policies/shipping-policy" className="underline">Shipping policy</Link> and{" "}
          <Link href="/policies/terms-of-service" className="underline">Terms of service</Link>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
