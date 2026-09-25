"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { fetchInventory, fetchInventoryCategories, type ApiResult } from "./inventory-api";
import {
  dateTime,
  EMPTY_INVENTORY_FILTERS,
  stockStateLabel,
  type InventoryFilters,
  type InventoryItem,
} from "./inventory-ui";

type Page = { inventory: InventoryItem[]; nextCursor: string | null };

function accessText(kind: "unauthenticated" | "forbidden") {
  return kind === "unauthenticated"
    ? "Your admin session has expired. Sign in again to continue."
    : "This account no longer has permission to manage inventory.";
}

function InventoryRows({ items }: { items: InventoryItem[] }) {
  if (!items.length) return <div className="rounded-2xl border border-dashed border-ink/20 bg-paper/50 px-6 py-12 text-center"><h2 className="text-lg font-semibold">No inventory found</h2><p className="mt-2 text-sm text-ink/65">Try changing the submitted search or filters.</p></div>;
  return <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm"><div className="divide-y divide-ink/10">{items.map((item) => <article key={item.variantId} className="grid gap-4 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-center">
    <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink">{item.product.name}</h2><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.product.isActive ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-950"}`}>{item.product.isActive ? "Active" : "Archived"}</span></div><p className="mt-1 text-xs font-semibold uppercase tracking-wider text-forest">{item.product.category.name}</p><p className="mt-2 text-sm text-ink/65">SKU {item.variant.sku}{item.variant.size ? ` · ${item.variant.size}` : ""}{item.variant.color ? ` · ${item.variant.color}` : ""}</p></div>
    <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-1"><div><dt className="text-ink/55">Quantity</dt><dd className="text-xl font-semibold tabular-nums">{item.inventory.quantity ?? "—"}</dd></div><div><dt className="text-ink/55">State</dt><dd className={`font-semibold ${item.inventory.state === "MISSING_INVENTORY" ? "text-red-700" : item.inventory.state === "OUT_OF_STOCK" ? "text-amber-800" : "text-emerald-800"}`}>{stockStateLabel(item.inventory.state)}</dd></div>{item.lastManualAdjustmentAt ? <div><dt className="text-ink/55">Last manual adjustment</dt><dd>{dateTime(item.lastManualAdjustmentAt)}</dd></div> : null}</dl>
    <Link href={`/admin/inventory/${encodeURIComponent(item.variantId)}`} prefetch={false} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-sand">View inventory</Link>
  </article>)}</div></div>;
}

export function AdminInventoryList() {
  const [draft, setDraft] = useState<InventoryFilters>({ ...EMPTY_INVENTORY_FILTERS });
  const [applied, setApplied] = useState<InventoryFilters>({ ...EMPTY_INVENTORY_FILTERS });
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [page, setPage] = useState<Page>({ inventory: [], nextCursor: null });
  const [categories, setCategories] = useState<Array<{ name: string; slug: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"unauthenticated" | "forbidden" | "error" | null>(null);
  const version = useRef(0);

  const accept = useCallback((result: ApiResult<Page>, filters: InventoryFilters, stack: Array<string | null>, request: number) => {
    if (request !== version.current) return;
    setLoading(false);
    if (result.kind === "ok") { setPage(result.data); setApplied(filters); setCursors(stack); setFailure(null); }
    else setFailure(result.kind === "unauthenticated" || result.kind === "forbidden" ? result.kind : "error");
  }, []);
  const load = useCallback(async (filters: InventoryFilters, stack: Array<string | null>) => {
    const request = ++version.current; setLoading(true); setFailure(null);
    accept(await fetchInventory(filters, stack.at(-1) ?? null), filters, stack, request);
  }, [accept]);
  useEffect(() => {
    const request = ++version.current;
    void Promise.all([fetchInventory(EMPTY_INVENTORY_FILTERS, null), fetchInventoryCategories()]).then(([inventory, categoryResult]) => {
      if (request !== version.current) return;
      if (categoryResult.kind !== "ok") {
        setLoading(false);
        setFailure(categoryResult.kind === "unauthenticated" || categoryResult.kind === "forbidden" ? categoryResult.kind : "error");
        return;
      }
      setCategories(categoryResult.data);
      accept(inventory, { ...EMPTY_INVENTORY_FILTERS }, [null], request);
    });
    return () => { version.current += 1; };
  }, [accept]);
  function submit(event: FormEvent) { event.preventDefault(); void load({ ...draft }, [null]); }

  return <section aria-labelledby="inventory-heading"><div><p className="text-xs font-semibold uppercase tracking-widest text-forest">Stock management</p><h1 id="inventory-heading" className="mt-2 text-3xl font-semibold">Inventory</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">Review stock by variant and record controlled manual adjustments. Checkout reservations remain authoritative.</p></div>
    <form onSubmit={submit} className="mt-8 rounded-2xl border border-ink/10 bg-paper/60 p-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold">Search<input type="search" maxLength={160} value={draft.search} onChange={(event) => setDraft((value) => ({ ...value, search: event.target.value }))} placeholder="Product, slug, SKU, size or colour" className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3" /></label><label className="text-sm font-semibold">Category<select value={draft.category} onChange={(event) => setDraft((value) => ({ ...value, category: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3"><option value="">All categories</option>{categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select></label><label className="text-sm font-semibold">Product visibility<select value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value as InventoryFilters["status"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3"><option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Archived</option></select></label><label className="text-sm font-semibold">Stock state<select value={draft.stock} onChange={(event) => setDraft((value) => ({ ...value, stock: event.target.value as InventoryFilters["stock"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3"><option value="">All states</option><option value="IN_STOCK">In stock</option><option value="OUT_OF_STOCK">Out of stock</option><option value="MISSING_INVENTORY">Missing inventory</option></select></label></div><div className="mt-4 flex gap-3"><button disabled={loading} className="min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Loading..." : "Apply filters"}</button><button type="button" disabled={loading} onClick={() => { setDraft({ ...EMPTY_INVENTORY_FILTERS }); void load({ ...EMPTY_INVENTORY_FILTERS }, [null]); }} className="min-h-11 rounded-xl border border-ink/20 bg-white px-5 text-sm font-semibold disabled:opacity-50">Reset</button></div></form>
    <div className="mt-8" aria-live="polite" aria-busy={loading}>{loading ? <p role="status" className="rounded-2xl bg-paper p-10 text-center text-sm">Loading inventory...</p> : failure === "unauthenticated" || failure === "forbidden" ? <div role="alert" className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-950"><p>{accessText(failure)}</p><Link href="/admin/login" className="mt-3 inline-flex font-semibold underline">Go to admin sign in</Link></div> : failure ? <div role="alert" className="rounded-2xl bg-red-50 p-5 text-sm text-red-900"><p>Inventory could not be loaded.</p><button onClick={() => void load(applied, cursors)} className="mt-3 font-semibold underline">Try again</button></div> : <InventoryRows items={page.inventory} />}</div>
    {!loading && !failure && page.inventory.length ? <nav aria-label="Inventory pagination" className="mt-6 flex justify-between border-t border-ink/10 pt-5"><button disabled={cursors.length <= 1} onClick={() => void load(applied, cursors.slice(0, -1))} className="min-h-11 rounded-xl border px-4 disabled:opacity-40">Previous</button><span className="py-3 text-sm">Page {cursors.length}</span><button disabled={!page.nextCursor} onClick={() => page.nextCursor && void load(applied, [...cursors, page.nextCursor])} className="min-h-11 rounded-xl border px-4 disabled:opacity-40">Next</button></nav> : null}
  </section>;
}
