import { PolicyList, PolicyPage, PolicySection } from "@/components/storefront/policy-page";
import { storeInfo } from "@/lib/data/catalog";

export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage title="Privacy policy" updated="June 30, 2026">
      <PolicySection>
        <p>
          Deigon operates this store and website, including all related information, content, features, tools,
          products and services, in order to provide you, the customer, with a curated shopping experience (the
          &ldquo;Services&rdquo;). This Privacy Policy describes how we collect, use, and disclose your personal
          information when you visit, use, or make a purchase or other transaction using the Services, or otherwise
          communicate with us. If there is a conflict between our Terms of Service and this Privacy Policy, this
          Privacy Policy controls with respect to the collection, processing, and disclosure of your personal
          information.
        </p>
      </PolicySection>

      <PolicySection heading="Personal information we collect or process">
        <p>Depending on how you interact with the Services, we may collect or process the following categories of personal information:</p>
        <PolicyList
          items={[
            "Contact details, including your name, address, billing address, shipping address, phone number, and email address.",
            "Financial information, including payment card information, transaction details, form of payment, and payment confirmation.",
            "Account information, including your username, password, preferences and settings.",
            "Transaction information, including items you view, add to your cart, purchase, return, exchange or cancel, and your past transactions.",
            "Communications with us, including information you include when contacting customer support.",
            "Device information, including information about your device, browser, network connection, IP address, and other unique identifiers.",
            "Usage information, including how and when you interact with the Services.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Personal information sources">
        <PolicyList
          items={[
            "Directly from you, including when you create an account, use the Services, or communicate with us.",
            "Automatically through the Services, including through cookies and similar technologies.",
            "From our service providers, including our hosting, delivery, and payment processing partners.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="How we use your personal information">
        <PolicyList
          items={[
            "To provide, tailor, and improve the Services — process payments, fulfil orders, arrange shipping and pickup, manage your account, and facilitate returns and exchanges.",
            "Marketing and advertising — to send marketing, promotional, and product update communications, where you have not opted out.",
            "Security and fraud prevention — to authenticate accounts and provide a secure shopping experience.",
            "Communicating with you — to provide customer support and respond to enquiries.",
            "Legal reasons — to comply with applicable law or respond to valid legal process.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="How we disclose personal information">
        <p>We may disclose your personal information to third parties for legitimate purposes, including:</p>
        <PolicyList
          items={[
            "With our payment processor (Yoco) to securely process your payment.",
            "With delivery and courier partners to fulfil and ship your order.",
            "With service providers who perform services on our behalf (for example, hosting, analytics, and customer support tools).",
            "When you direct or consent to disclosure, or in connection with a business transaction, legal obligation, or to protect the rights and safety of Deigon and our customers.",
          ]}
        />
      </PolicySection>

      <PolicySection heading="Payment processing">
        <p>
          Payments made through the Services are processed by Yoco, a licensed South African payment service
          provider. Card and payment details you submit during checkout are transmitted directly to Yoco and are
          handled in accordance with Yoco&apos;s own privacy and security practices — Deigon does not store your full
          card details.
        </p>
      </PolicySection>

      <PolicySection heading="Third-party websites and links">
        <p>
          The Services may link to websites or platforms operated by third parties. We are not responsible for the
          privacy or security practices of third-party sites. We encourage you to review their policies before
          providing any personal information.
        </p>
      </PolicySection>

      <PolicySection heading="Children's data">
        <p>
          The Services are not intended for use by children, and we do not knowingly collect personal information
          about children under the age of majority in your jurisdiction. If you are a parent or guardian and believe
          your child has provided us with personal information, please contact us so we can delete it.
        </p>
      </PolicySection>

      <PolicySection heading="Security and retention">
        <p>
          No security measures are perfect or impenetrable, and we cannot guarantee &ldquo;perfect security.&rdquo;
          We retain your personal information only for as long as necessary to provide the Services, comply with our
          legal obligations, resolve disputes, and enforce our agreements and policies.
        </p>
      </PolicySection>

      <PolicySection heading="Your rights and choices">
        <p>Depending on where you live, you may have the right to:</p>
        <PolicyList
          items={[
            "Access personal information we hold about you.",
            "Request that we delete personal information we maintain about you.",
            "Request that we correct inaccurate personal information.",
            "Receive a copy of your personal information in a portable format.",
            "Opt out of marketing communications at any time using the unsubscribe link in our emails.",
          ]}
        />
        <p>You may exercise these rights by contacting us using the details below.</p>
      </PolicySection>

      <PolicySection heading="International transfers">
        <p>
          We may transfer, store, and process your personal information outside the country you live in, including
          where our service providers operate.
        </p>
      </PolicySection>

      <PolicySection heading="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time to reflect changes to our practices or for legal or
          operational reasons. We will post the revised policy on this page and update the &ldquo;Last
          updated&rdquo; date above.
        </p>
      </PolicySection>

      <PolicySection heading="Contact">
        <p>
          Should you have any questions about our privacy practices or this Privacy Policy, or if you would like to
          exercise any of the rights available to you, please call {storeInfo.phone} or email us at{" "}
          <a href={`mailto:${storeInfo.email}`} className="underline">
            {storeInfo.email}
          </a>
          .
        </p>
        <p>
          {storeInfo.legalName}
          <br />
          {storeInfo.addressLines.join(", ")}
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
