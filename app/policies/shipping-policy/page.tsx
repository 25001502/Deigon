import { PolicyList, PolicyPage, PolicySection } from "@/components/storefront/policy-page";

export const metadata = {
  title: "Shipping Policy",
};

export default function ShippingPolicyPage() {
  return (
    <PolicyPage title="Shipping policy">
      <PolicySection heading="Order processing">
        <PolicyList
          items={[
            "Once your order is confirmed, you will receive an email with your order number.",
            "You will receive a notification with a tracking number as soon as your order has been shipped.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Shipping timeframe">
        <PolicyList
          items={[
            "All orders are processed and shipped within 5–10 business days.",
            "Weekends and public holidays are not considered business days.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Shipping cost">
        <PolicyList
          items={[
            "A flat shipping fee of R80 applies to all orders under R600.",
            "Free shipping for orders above R600.",
            "Free delivery around Thohoyandou.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Shipping address">
        <PolicyList
          items={[
            "Please double-check your shipping address when placing your order to avoid any delivery issues.",
            "Deigon cannot be held responsible for delays or non-delivery due to incorrect address details.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Pickup">
        <p>
          Pickup is available at Univen main gate, Thohoyandou, Limpopo, 0950, South Africa — usually ready within
          24 hours.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
