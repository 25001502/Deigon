import { PolicyPage, PolicySection } from "@/components/storefront/policy-page";
import { storeInfo } from "@/lib/data/catalog";

export const metadata = {
  title: "Terms of Service",
};

export default function TermsOfServicePage() {
  return (
    <PolicyPage title="Terms of service">
      <PolicySection heading="Overview">
        <p>
          Welcome to Deigon! The terms &ldquo;we&rdquo;, &ldquo;us&rdquo; and &ldquo;our&rdquo; refer to Deigon.
          Deigon operates this store and website, including all related information, content, features, tools,
          products and services, in order to provide you, the customer, with a curated shopping experience (the
          &ldquo;Services&rdquo;).
        </p>
        <p>
          These Terms of Service, together with any policies referenced herein, describe your rights and
          responsibilities when you use the Services. Please read them carefully, as they include important
          information about your legal rights and cover areas such as warranty disclaimers and limitations of
          liability. By visiting, interacting with, or using our Services, you agree to be bound by these Terms of
          Service and our{" "}
          <a href="/policies/privacy-policy" className="underline">
            Privacy Policy
          </a>
          . If you do not agree, you should not use or access our Services.
        </p>
      </PolicySection>

      <PolicySection heading="1. Access and account">
        <p>
          By agreeing to these Terms of Service, you represent that you are at least the age of majority in your
          province or country of residence. To use the Services, you may be asked to provide information such as
          your email address, billing, payment, and shipping information. You represent that all information you
          provide is correct, current, and complete, and that you have the rights necessary to provide it. You are
          solely responsible for maintaining the security of your account credentials and for all activity on your
          account.
        </p>
      </PolicySection>

      <PolicySection heading="2. Our products">
        <p>
          We have made every effort to provide an accurate representation of our products in our online store.
          Colours or product appearance may differ from how they appear on your screen due to your device and
          display settings. All descriptions of products are subject to change at any time without notice, and we
          reserve the right to discontinue any product or limit quantities available.
        </p>
      </PolicySection>

      <PolicySection heading="3. Orders">
        <p>
          When you place an order, you are making an offer to purchase. Deigon reserves the right to accept or
          decline your order for any reason at its discretion. Your order is not accepted until Deigon confirms
          acceptance and processes your payment. Please review your order carefully before submitting, as we may be
          unable to accommodate cancellation requests after an order is accepted. Purchases are subject to return or
          exchange solely in accordance with our{" "}
          <a href="/policies/refund-policy" className="underline">
            Refund Policy
          </a>
          . You represent that your purchases are for personal or household use and not for commercial resale.
        </p>
      </PolicySection>

      <PolicySection heading="4. Prices and billing">
        <p>
          Prices, discounts, and promotions are subject to change without notice. The price charged will be the
          price in effect at the time the order is placed and will be reflected in your order confirmation. Unless
          otherwise stated, posted prices do not include shipping. You agree to provide current, complete, and
          accurate purchase and payment information for all purchases, and to pay all charges incurred at the posted
          prices, including shipping and any applicable taxes.
        </p>
      </PolicySection>

      <PolicySection heading="5. Shipping and delivery">
        <p>
          Please see our{" "}
          <a href="/policies/shipping-policy" className="underline">
            Shipping Policy
          </a>{" "}
          for processing times, delivery fees, and pickup information. All delivery times are estimates only and are
          not guaranteed; we are not responsible for delays caused by couriers or events outside our control. Once
          we hand products to the courier, title and risk of loss passes to you.
        </p>
      </PolicySection>

      <PolicySection heading="6. Intellectual property">
        <p>
          Our Services, including all trademarks, brands, text, images, graphics, and the design and arrangement
          thereof, are owned by Deigon or its licensors and are protected by applicable intellectual property laws.
          These Terms permit you to use the Services for personal, non-commercial use only. You must not reproduce,
          distribute, modify, publicly display, or create derivative works from any material on the Services
          without our prior written consent. Deigon&apos;s names, logos, product names, designs, and slogans are
          trademarks of Deigon and may not be used without prior written permission.
        </p>
      </PolicySection>

      <PolicySection heading="7. Optional tools">
        <p>
          We may provide access to tools offered by third parties that we do not monitor or control. Such tools are
          provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, and any use of
          them is entirely at your own risk.
        </p>
      </PolicySection>

      <PolicySection heading="8. Third-party links">
        <p>
          The Services may contain links to websites operated by third parties. We are not responsible for examining
          or evaluating the content or accuracy of third-party materials, and we are not liable for any harm related
          to your access of third-party websites or your use of their products or services.
        </p>
      </PolicySection>

      <PolicySection heading="9. Payment processing">
        <p>
          Payments for orders placed through the Services are processed by Yoco, a third-party payment service
          provider. By completing a purchase, you agree to Yoco&apos;s applicable terms for processing your payment.
          Deigon is responsible for the sale of products to you; Yoco is responsible only for securely processing
          your payment.
        </p>
      </PolicySection>

      <PolicySection heading="10. Privacy policy">
        <p>
          All personal information we collect is subject to our{" "}
          <a href="/policies/privacy-policy" className="underline">
            Privacy Policy
          </a>
          . By using the Services, you acknowledge that you have read and understood how your information is
          collected, used, and disclosed.
        </p>
      </PolicySection>

      <PolicySection heading="11. Feedback">
        <p>
          If you submit ideas, suggestions, or feedback about the Services, you grant us a perpetual, royalty-free
          licence to use, reproduce, and publish that feedback for any purpose, including commercial use. You
          represent that your feedback will not violate any third party&apos;s rights and will not contain unlawful
          or abusive content.
        </p>
      </PolicySection>

      <PolicySection heading="12. Errors, inaccuracies and omissions">
        <p>
          Occasionally there may be information on the Services that contains typographical errors, inaccuracies,
          or omissions relating to product descriptions, pricing, or availability. We reserve the right to correct
          any errors and to change or cancel orders if any information is found to be inaccurate, at any time
          without prior notice.
        </p>
      </PolicySection>

      <PolicySection heading="13. Prohibited uses">
        <p>
          You may access and use the Services for lawful purposes only. You may not use the Services to violate any
          law, infringe our intellectual property or that of others, harass or harm any person, transmit false or
          misleading information, upload viruses or malicious code, or otherwise interfere with the security or
          proper functioning of the Services. We reserve the right to suspend or terminate your access at any time
          if we determine you have violated these Terms.
        </p>
      </PolicySection>

      <PolicySection heading="14. Termination">
        <p>
          We may terminate this agreement or your access to the Services at our sole discretion at any time without
          notice, and you will remain liable for all amounts due up to the date of termination. Provisions that by
          their nature should survive termination will continue to apply.
        </p>
      </PolicySection>

      <PolicySection heading="15. Disclaimer of warranties">
        <p>
          The information presented on the Services is made available for general information purposes only. Except
          as expressly stated, the Services and all products offered are provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; without warranties of any kind, whether express or implied, including implied warranties
          of merchantability, fitness for a particular purpose, and non-infringement.
        </p>
      </PolicySection>

      <PolicySection heading="16. Limitation of liability">
        <p>
          To the fullest extent permitted by law, Deigon, its partners, officers, employees, and agents shall not be
          liable for any indirect, incidental, punitive, special, or consequential damages arising from your use of
          the Services or any products procured through the Services.
        </p>
      </PolicySection>

      <PolicySection heading="17. Indemnification">
        <p>
          You agree to indemnify and hold harmless Deigon and its affiliates, officers, employees, and agents from
          any losses, damages, or claims arising from your breach of these Terms, your violation of any law or
          third-party right, or your use of the Services.
        </p>
      </PolicySection>

      <PolicySection heading="18. Severability">
        <p>
          If any provision of these Terms is found to be unlawful or unenforceable, that provision will be severed,
          and the remaining provisions will continue in full force and effect.
        </p>
      </PolicySection>

      <PolicySection heading="19. Waiver; entire agreement">
        <p>
          Our failure to enforce any right or provision of these Terms will not constitute a waiver of that right or
          provision. These Terms, together with any referenced policies, constitute the entire agreement between you
          and Deigon regarding the Services.
        </p>
      </PolicySection>

      <PolicySection heading="20. Assignment">
        <p>
          You may not transfer or assign these Terms or your rights and obligations under them without our prior
          written consent. We may transfer or assign these Terms without restriction.
        </p>
      </PolicySection>

      <PolicySection heading="21. Governing law">
        <p>
          These Terms of Service shall be governed by and construed in accordance with the laws of South Africa.
        </p>
      </PolicySection>

      <PolicySection heading="22. Headings">
        <p>The headings used in this agreement are included for convenience only and will not limit these Terms.</p>
      </PolicySection>

      <PolicySection heading="23. Changes to these terms">
        <p>
          We reserve the right to update, change, or replace any part of these Terms of Service by posting updates
          to this page. Your continued use of the Services following any changes constitutes acceptance of those
          changes.
        </p>
      </PolicySection>

      <PolicySection heading="24. Contact information">
        <p>Questions about these Terms of Service should be sent to us at:</p>
        <p>
          {storeInfo.legalName}
          <br />
          <a href={`mailto:${storeInfo.email}`} className="underline">
            {storeInfo.email}
          </a>
          <br />
          {storeInfo.phone}
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
