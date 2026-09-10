"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useCart } from "@/components/cart/cart-provider";
import { formatRand } from "@/lib/money";
import type { StorefrontProduct } from "@/lib/products";

type ProductPurchasePanelProps = {
  product: StorefrontProduct;
};

export function ProductPurchasePanel({
  product,
}: ProductPurchasePanelProps) {
  const { addItem } = useCart();
  const router = useRouter();

  const variants = product.variants;

  const colors = useMemo(
    () =>
      [
        ...new Set(
          variants
            .map((variant) => variant.color)
            .filter(
              (color): color is string =>
                Boolean(color),
            ),
        ),
      ],
    [variants],
  );

  const sizes = useMemo(
    () =>
      [
        ...new Set(
          variants
            .map((variant) => variant.size)
            .filter(
              (size): size is string =>
                Boolean(size),
            ),
        ),
      ],
    [variants],
  );

  const showColorSelector =
    variants.length > 1 && colors.length > 1;

  const showSizeSelector =
    variants.length > 1 && sizes.length > 1;

  const [selectedColor, setSelectedColor] =
    useState<string | undefined>(
      colors.length === 1 ? colors[0] : undefined,
    );

  const [selectedSize, setSelectedSize] =
    useState<string | undefined>(
      sizes.length === 1 ? sizes[0] : undefined,
    );

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [buying, setBuying] = useState(false);

  const hasAvailableVariant = (
    color: string | undefined,
    size: string | undefined,
  ) =>
    variants.some(
      (variant) =>
        variant.inventory.inStock &&
        (color === undefined ||
          variant.color === color) &&
        (size === undefined ||
          variant.size === size),
    );

  const selectedVariant =
    variants.find(
      (variant) =>
        (colors.length === 0 ||
          variant.color === selectedColor) &&
        (sizes.length === 0 ||
          variant.size === selectedSize),
    ) ?? (variants.length === 1 ? variants[0] : undefined);

  const hasNoVariants = variants.length === 0;

  const missingColor =
    showColorSelector && !selectedColor;

  const missingSize =
    showSizeSelector && !selectedSize;

  const canPurchase =
    hasNoVariants ||
    Boolean(
      selectedVariant?.inventory.inStock &&
        !missingColor &&
        !missingSize,
    );

  const maxQuantity = hasNoVariants
    ? Number.POSITIVE_INFINITY
    : selectedVariant?.inventory.quantity ?? 0;

  const displayPrice =
    selectedVariant?.price ?? product.price;

  const validationMessage = missingColor
    ? "Select a color to continue."
    : missingSize
      ? "Select a size to continue."
      : selectedVariant &&
          !selectedVariant.inventory.inStock
        ? "This option is sold out."
        : !selectedVariant && !hasNoVariants
          ? "Select an available combination to continue."
          : null;

  useEffect(() => {
    setQuantity((current) =>
      Math.max(
        1,
        Math.min(
          current,
          Number.isFinite(maxQuantity)
            ? maxQuantity || 1
            : current,
        ),
      ),
    );
  }, [maxQuantity]);

  const addToCart = async (
    waitForServer = false,
  ) => {
    if (!canPurchase) {
      return false;
    }

    try {
      await addItem(
        {
          ...product,
          variantId:
            selectedVariant?.variantId ??
            product.variantId,
          sku: selectedVariant?.sku,
          size: selectedVariant?.size,
          color: selectedVariant?.color,
          price: displayPrice,
        },
        quantity,
        {
          waitForServer,
        },
      );

      setAdded(true);

      window.setTimeout(
        () => setAdded(false),
        1400,
      );

      return true;
    } catch {
      return false;
    }
  };

  const buyNow = async () => {
    if (!canPurchase || buying) {
      return;
    }

    setBuying(true);

    // Buy Now waits for the authenticated cart write so checkout
    // cannot load before the server has the item.
    const wasAdded = await addToCart(true);

    if (wasAdded) {
      router.push("/checkout");
      return;
    }

    setBuying(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xl font-medium text-neutral-900">
          {formatRand(displayPrice)}
        </p>

        <p className="mt-3 text-sm text-neutral-600">
          <Link
            href="/policies/shipping-policy"
            className="underline"
          >
            Shipping
          </Link>{" "}
          calculated at checkout.
        </p>
      </div>

      {showColorSelector ? (
        <fieldset>
          <legend className="mb-2 text-sm text-neutral-600">
            Color
            {selectedColor
              ? `: ${selectedColor}`
              : ""}
          </legend>

          <div className="flex flex-wrap gap-2">
            {colors.map((color) => {
              const isAvailable =
                hasAvailableVariant(
                  color,
                  undefined,
                );

              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`Select color ${color}`}
                  aria-pressed={
                    selectedColor === color
                  }
                  disabled={!isAvailable}
                  onClick={() => {
                    setSelectedColor(color);

                    if (
                      selectedSize &&
                      !hasAvailableVariant(
                        color,
                        selectedSize,
                      )
                    ) {
                      setSelectedSize(undefined);
                    }
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
                    selectedColor === color
                      ? "border-black"
                      : "border-neutral-300 hover:border-neutral-600"
                  } disabled:cursor-not-allowed disabled:opacity-30`}
                >
                  <span
                    className="h-8 w-8 rounded-full border border-black/10"
                    style={{
                      backgroundColor: color,
                    }}
                    title={color}
                  />
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {!showColorSelector &&
      colors.length === 1 ? (
        <p className="text-sm text-neutral-600">
          Color: {colors[0]}
        </p>
      ) : null}

      {showSizeSelector ? (
        <fieldset>
          <legend className="mb-2 text-sm text-neutral-600">
            Size
            {selectedSize
              ? `: ${selectedSize}`
              : ""}
          </legend>

          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => {
              const isAvailable =
                hasAvailableVariant(
                  selectedColor,
                  size,
                );

              return (
                <button
                  key={size}
                  type="button"
                  aria-label={`Select size ${size}`}
                  aria-pressed={
                    selectedSize === size
                  }
                  disabled={!isAvailable}
                  onClick={() => {
                    setSelectedSize(size);

                    if (
                      selectedColor &&
                      !hasAvailableVariant(
                        selectedColor,
                        size,
                      )
                    ) {
                      setSelectedColor(undefined);
                    }
                  }}
                  className={`min-w-18 rounded-full border px-5 py-2 text-sm transition ${
                    selectedSize === size
                      ? "border-black bg-black text-white"
                      : "border-neutral-400 hover:border-black"
                  } disabled:cursor-not-allowed disabled:opacity-30`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {!showSizeSelector &&
      sizes.length === 1 ? (
        <p className="text-sm text-neutral-600">
          Size: {sizes[0]}
        </p>
      ) : null}

      {validationMessage ? (
        <p className="text-sm text-neutral-600">
          {validationMessage}
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-sm text-neutral-600">
          Quantity
        </p>

        <div className="flex w-40 items-center justify-between rounded-full border border-neutral-400 px-4 py-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() =>
              setQuantity((current) =>
                Math.max(1, current - 1),
              )
            }
            disabled={
              !canPurchase || quantity <= 1
            }
            className="h-7 w-7 text-lg leading-none text-neutral-600 transition hover:text-black disabled:opacity-30"
          >
            -
          </button>

          <span className="text-sm tabular-nums">
            {quantity}
          </span>

          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() =>
              setQuantity((current) =>
                Math.min(
                  current + 1,
                  maxQuantity,
                ),
              )
            }
            disabled={
              !canPurchase ||
              quantity >= maxQuantity
            }
            className="h-7 w-7 text-lg leading-none text-neutral-600 transition hover:text-black disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          void addToCart(false);
        }}
        disabled={
          !canPurchase || buying
        }
        className="flex w-full items-center justify-center rounded-full border border-black px-6 py-4 text-sm font-medium text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {added ? "Added to cart" : "Add to cart"}
      </button>

      <button
        type="button"
        disabled={
          !canPurchase || buying
        }
        onClick={() => {
          void buyNow();
        }}
        className="flex w-full items-center justify-center rounded-full bg-black px-6 py-4 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {buying ? "Preparing checkout..." : "Buy it now"}
      </button>
    </div>
  );
}