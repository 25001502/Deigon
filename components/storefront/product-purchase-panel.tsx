"use client";

import Link from "next/link";
import { startTransition, useState } from "react";

import { useCart } from "@/components/cart/cart-provider";
import type { Product } from "@/lib/data/catalog";

type ProductPurchasePanelProps = {
  product: Pick<Product, "badge" | "handle" | "price" | "themeClass" | "title" | "vendor">;
};

export function ProductPurchasePanel({ product }: ProductPurchasePanelProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const addToCart = () => {
    startTransition(() => {
      addItem(product, quantity);
      setAdded(true);
    });

    window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm text-neutral-600">Quantity</p>
        <div className="flex w-40 items-center justify-between rounded-full border border-neutral-400 px-4 py-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((current) => Math.max(1, current - 1))}
            className="h-7 w-7 text-lg leading-none text-neutral-600 transition hover:text-black"
          >
            -
          </button>
          <span className="text-sm tabular-nums">{quantity}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity((current) => current + 1)}
            className="h-7 w-7 text-lg leading-none text-neutral-600 transition hover:text-black"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={addToCart}
        className="flex w-full items-center justify-center rounded-full border border-black px-6 py-4 text-sm font-medium text-black transition hover:bg-black hover:text-white"
      >
        {added ? "Added to cart" : "Add to cart"}
      </button>
      <Link
        href="/checkout"
        onClick={addToCart}
        className="flex w-full items-center justify-center rounded-full bg-black px-6 py-4 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        Buy it now
      </Link>
    </div>
  );
}