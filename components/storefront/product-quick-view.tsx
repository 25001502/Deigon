"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { ProductPurchasePanel } from "@/components/storefront/product-purchase-panel";
import { MockProductMedia } from "@/components/storefront/mock-product-media";
import type { StorefrontProduct } from "@/lib/products";

export function ProductQuickView({ product, onClose }: { product: StorefrontProduct; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeImage, setActiveImage] = useState(0);
  const images = product.images ?? [];
  const gallery = images.length > 0 ? images : product.image ? [product.image] : [];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/35 px-3 py-4 backdrop-blur-[2px] sm:px-6 sm:py-8" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="quick-view-title" className="relative mx-auto grid min-h-full max-w-6xl overflow-hidden bg-[#f7f7f5] shadow-2xl lg:min-h-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(23rem,0.92fr)]">
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close product quick view" className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-white text-xl text-black shadow-sm transition hover:bg-black hover:text-white">×</button>
        <div className="bg-white p-4 sm:p-7 lg:p-10">
          {gallery.length > 0 ? (
            <div className="relative aspect-square overflow-hidden bg-[#efefed]">
              <Image src={gallery[activeImage]} alt={product.title} fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
            </div>
          ) : (
            <MockProductMedia title={product.title} vendor={product.vendor} badge={product.badge} themeClass={product.themeClass} className="aspect-square min-h-0 rounded-none border-none p-8" />
          )}
          {gallery.length > 1 ? (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {gallery.map((source, index) => (
                <button key={source} type="button" onClick={() => setActiveImage(index)} aria-label={`Show image ${index + 1} of ${product.title}`} aria-pressed={activeImage === index} className={`relative h-20 w-16 shrink-0 overflow-hidden border-2 ${activeImage === index ? "border-black" : "border-transparent"}`}>
                  <Image src={source} alt="" fill sizes="64px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-y-auto px-6 pb-8 pt-16 sm:px-10 sm:pb-10 lg:max-h-[min(52rem,calc(100vh-4rem))] lg:pt-12">
          <p className="text-sm text-neutral-600">{product.vendor}</p>
          <h2 id="quick-view-title" className="mt-5 text-4xl font-bold leading-none text-black sm:text-5xl">{product.title}</h2>
          <div className="mt-7"><ProductPurchasePanel product={product} /></div>
          <div className="mt-8 border-t border-neutral-300 pt-6 text-sm leading-7 text-neutral-600">
            {product.shortDescription ? <p>{product.shortDescription}</p> : null}
            {product.description ? <p className="mt-3 whitespace-pre-line">{product.description}</p> : null}
            {product.details?.length ? <ul className="mt-4 space-y-1.5">{product.details.map((detail) => <li key={detail} className="flex gap-2"><span aria-hidden>•</span><span>{detail}</span></li>)}</ul> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
