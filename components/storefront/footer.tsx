import Link from "next/link";

const footerLinks = [
  { href: "/collections/foxygeon-collections", label: "Collections" },
  { href: "/cart", label: "Cart" },
  { href: "/checkout", label: "Checkout demo" },
];

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-paper/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">
            Deigon prototype
          </p>
          <h2 className="mt-4 font-display text-4xl text-ink">
            A cleaner storefront now, real ecommerce wiring after approval.
          </h2>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">
              Explore
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {footerLinks.map((link) => (
                <Link key={link.href} href={link.href} className="text-sm text-ink/72 transition hover:text-ink">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">
              Demo note
            </p>
            <p className="mt-4 text-sm leading-7 text-ink/72">
              The current prototype keeps the storefront believable while leaving payments,
              fulfillment, and admin tools for the production phase.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}