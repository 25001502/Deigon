"use client";

/* eslint-disable @next/next/no-img-element -- product URLs are validated against the storefront allowlist. */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { fetchCategories, fetchProducts, type ApiResult } from "./product-api";
import { dateTime, EMPTY_FILTERS, money, type AdminProductListItem, type ProductCategory, type ProductFilters } from "./product-ui";

type Page = { products: AdminProductListItem[]; nextCursor: string | null };

function accessText(kind: "unauthenticated" | "forbidden") {
  return kind === "unauthenticated" ? "Your admin session has expired. Sign in again to continue." : "This account no longer has permission to manage products.";
}

function Products({ products }: { products: AdminProductListItem[] }) {
  if (!products.length) return <div className="rounded-2xl border border-dashed border-ink/20 bg-paper/50 px-6 py-12 text-center"><h2 className="text-lg font-semibold">No products found</h2><p className="mt-2 text-sm text-ink/65">Try changing the submitted search or filters.</p></div>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => <article key={product.id} className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
    <div className="aspect-[4/3] bg-paper">{product.thumbnail ? <img src={product.thumbnail.url} alt={product.thumbnail.alt ?? product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-ink/40">No image</div>}</div>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-forest">{product.category.name}</p><h2 className="mt-1 font-semibold text-ink">{product.name}</h2><p className="mt-1 break-all text-xs text-ink/55">/{product.slug}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.isActive ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>{product.isActive ? "Active" : "Archived"}</span></div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-ink/55">Price</dt><dd className="font-semibold">{money(product.minimumPrice)}{product.maximumPrice !== product.minimumPrice && product.maximumPrice ? ` – ${money(product.maximumPrice)}` : ""}</dd></div><div><dt className="text-ink/55">Variants</dt><dd className="font-semibold">{product.variantCount}</dd></div></dl>
      <p className="mt-4 text-xs text-ink/50">Updated {dateTime(product.updatedAt)}</p><Link href={`/admin/products/${encodeURIComponent(product.id)}`} prefetch={false} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-sand">Edit product</Link>
    </div></article>)}</div>;
}

export function AdminProductsList() {
  const [draft, setDraft] = useState<ProductFilters>({ ...EMPTY_FILTERS });
  const [applied, setApplied] = useState<ProductFilters>({ ...EMPTY_FILTERS });
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [page, setPage] = useState<Page>({ products: [], nextCursor: null });
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"unauthenticated" | "forbidden" | "error" | null>(null);
  const version = useRef(0);

  const accept = useCallback((result: ApiResult<Page>, filters: ProductFilters, stack: Array<string | null>, request: number) => {
    if (request !== version.current) return;
    setLoading(false);
    if (result.kind === "ok") { setPage(result.data); setApplied(filters); setCursors(stack); setFailure(null); }
    else setFailure(result.kind === "unauthenticated" || result.kind === "forbidden" ? result.kind : "error");
  }, []);
  const load = useCallback(async (filters: ProductFilters, stack: Array<string | null>) => {
    const request = ++version.current; setLoading(true); setFailure(null);
    accept(await fetchProducts(filters, stack.at(-1) ?? null), filters, stack, request);
  }, [accept]);
  useEffect(() => {
    const request = ++version.current;
    void Promise.all([fetchProducts(EMPTY_FILTERS, null), fetchCategories()]).then(([products, categoryResult]) => {
      if (request !== version.current) return;
      if (categoryResult.kind !== "ok") {
        setLoading(false);
        setFailure(categoryResult.kind === "unauthenticated" || categoryResult.kind === "forbidden" ? categoryResult.kind : "error");
        return;
      }
      if (categoryResult.kind === "ok") setCategories(categoryResult.data);
      accept(products, { ...EMPTY_FILTERS }, [null], request);
    });
    return () => { version.current += 1; };
  }, [accept]);
  function submit(event: FormEvent) { event.preventDefault(); void load({ ...draft }, [null]); }
  return <section aria-labelledby="products-heading"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-forest">Catalogue management</p><h1 id="products-heading" className="mt-2 text-3xl font-semibold">Products</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">Manage storefront product details, visibility, images and variant pricing. Stock is managed separately.</p></div><Link href="/admin/products/new" className="inline-flex min-h-11 items-center rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest">Create product</Link></div>
    <form onSubmit={submit} className="mt-8 rounded-2xl border border-ink/10 bg-paper/60 p-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold">Search<input type="search" maxLength={160} value={draft.search} onChange={(e) => setDraft((v) => ({ ...v, search: e.target.value }))} placeholder="Name, slug, SKU or category" className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3" /></label><label className="text-sm font-semibold">Visibility<select value={draft.status} onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value as ProductFilters["status"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3"><option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Archived</option></select></label><label className="text-sm font-semibold">Featured<select value={draft.featured} onChange={(e) => setDraft((v) => ({ ...v, featured: e.target.value as ProductFilters["featured"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3"><option value="">All</option><option value="FEATURED">Featured</option><option value="STANDARD">Standard</option></select></label><label className="text-sm font-semibold">Category<select value={draft.category} onChange={(e) => setDraft((v) => ({ ...v, category: e.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3"><option value="">All categories</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label></div><div className="mt-4 flex gap-3"><button disabled={loading} className="min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Loading..." : "Apply filters"}</button><button type="button" disabled={loading} onClick={() => { setDraft({ ...EMPTY_FILTERS }); void load({ ...EMPTY_FILTERS }, [null]); }} className="min-h-11 rounded-xl border border-ink/20 bg-white px-5 text-sm font-semibold disabled:opacity-50">Reset</button></div></form>
    <div className="mt-8" aria-live="polite" aria-busy={loading}>{loading ? <p role="status" className="rounded-2xl bg-paper p-10 text-center text-sm">Loading products...</p> : failure === "unauthenticated" || failure === "forbidden" ? <div role="alert" className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-950"><p>{accessText(failure)}</p><Link href="/admin/login" className="mt-3 inline-flex font-semibold underline">Go to admin sign in</Link></div> : failure ? <div role="alert" className="rounded-2xl bg-red-50 p-5 text-sm text-red-900"><p>Products could not be loaded.</p><button onClick={() => void load(applied, cursors)} className="mt-3 font-semibold underline">Try again</button></div> : <Products products={page.products} />}</div>
    {!loading && !failure && page.products.length ? <nav aria-label="Products pagination" className="mt-6 flex justify-between border-t border-ink/10 pt-5"><button disabled={cursors.length <= 1} onClick={() => void load(applied, cursors.slice(0, -1))} className="min-h-11 rounded-xl border px-4 disabled:opacity-40">Previous</button><span className="py-3 text-sm">Page {cursors.length}</span><button disabled={!page.nextCursor} onClick={() => page.nextCursor && void load(applied, [...cursors, page.nextCursor])} className="min-h-11 rounded-xl border px-4 disabled:opacity-40">Next</button></nav> : null}
  </section>;
}
