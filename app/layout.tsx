import type { Metadata } from "next";
import { Cormorant_Garamond, Space_Grotesk } from "next/font/google";

import { CartProvider } from "@/components/cart/cart-provider";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Deigon Demo Storefront",
  description: "A storefront prototype for a refined Deigon shopping experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${cormorant.variable} bg-sand text-ink antialiased`}
      >
        <CartProvider>
          <div className="relative min-h-screen overflow-hidden">
            <Header />
            {children}
            <Footer />
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
