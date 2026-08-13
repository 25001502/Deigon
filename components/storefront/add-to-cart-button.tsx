"use client";

import { startTransition, useState } from "react";

import { useCart } from "@/components/cart/cart-provider";
import type { Product } from "@/lib/data/catalog";

type AddToCartButtonProps = {
  product: Pick<Product, "badge" | "handle" | "image" | "price" | "themeClass" | "title" | "vendor">;
};

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => {
          addItem(product);
          setAdded(true);
        });

        window.setTimeout(() => {
          setAdded(false);
        }, 1400);
      }}
      className="inline-flex items-center justify-center rounded-full bg-black px-7 py-4 text-sm font-medium text-white transition hover:bg-neutral-800"
    >
      {added ? "Added to cart" : "Add to cart"}
    </button>
  );
}