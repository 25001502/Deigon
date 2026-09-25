"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  archiveProduct,
  createProduct,
  createVariant,
  fetchCategories,
  fetchProduct,
  updateProduct,
  updateVariant,
  type ApiResult,
} from "./product-api";
import {
  detailToDraft,
  EMPTY_PRODUCT,
  EMPTY_VARIANT,
  type AdminProductDetail,
  type ProductCategory,
  type ProductDraft,
  type VariantDraft,
} from "./product-ui";

const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3 py-2 font-normal text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20 disabled:bg-paper disabled:opacity-70";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-sm font-semibold text-ink">{label}{children}{hint ? <span className="mt-1 block text-xs font-normal leading-5 text-ink/55">{hint}</span> : null}</label>;
}

function message(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
  if (result.kind === "unauthenticated") return "Your admin session has expired. Sign in again to continue.";
  if (result.kind === "forbidden") return "This account no longer has permission to manage products.";
  if (result.kind === "conflict") return "This product changed in another session, or a slug, SKU, or option combination is already in use. Reload before trying again.";
  if (result.kind === "not-found") return "The product or category could not be found.";
  if (result.kind === "invalid") return "Some catalogue details were not accepted. Check every required field, price, slug, image URL, SKU, and duplicate option combination.";
  return "The product could not be saved. Please try again.";
}

function VariantFields({ value, disabled, onChange }: { value: VariantDraft; disabled: boolean; onChange: (value: VariantDraft) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="SKU"><input required maxLength={100} value={value.sku} disabled={disabled} onChange={(e) => onChange({ ...value, sku: e.target.value })} className={inputClass} /></Field><Field label="Size"><input maxLength={80} value={value.size} disabled={disabled} onChange={(e) => onChange({ ...value, size: e.target.value })} placeholder="Optional" className={inputClass} /></Field><Field label="Colour"><input maxLength={80} value={value.color} disabled={disabled} onChange={(e) => onChange({ ...value, color: e.target.value })} placeholder="Optional" className={inputClass} /></Field><Field label="Base price"><input required inputMode="decimal" value={value.price} disabled={disabled} onChange={(e) => onChange({ ...value, price: e.target.value })} placeholder="899.00" className={inputClass} /></Field></div>;
}

function ProductFields({ value, categories, disabled, onChange }: { value: ProductDraft; categories: ProductCategory[]; disabled: boolean; onChange: (value: ProductDraft) => void }) {
  return <div className="grid gap-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Product name"><input required maxLength={160} value={value.name} disabled={disabled} onChange={(e) => onChange({ ...value, name: e.target.value })} className={inputClass} /></Field><Field label="Slug" hint="Lowercase letters, numbers and single hyphens."><input required maxLength={160} value={value.slug} disabled={disabled} onChange={(e) => onChange({ ...value, slug: e.target.value })} className={inputClass} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><select required value={value.categorySlug} disabled={disabled} onChange={(e) => onChange({ ...value, categorySlug: e.target.value })} className={inputClass}><option value="">Choose a category</option>{categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select></Field><Field label="Badge"><input maxLength={80} value={value.badge} disabled={disabled} onChange={(e) => onChange({ ...value, badge: e.target.value })} placeholder="Optional storefront label" className={inputClass} /></Field></div><Field label="Description"><textarea rows={6} maxLength={10000} value={value.description} disabled={disabled} onChange={(e) => onChange({ ...value, description: e.target.value })} className={inputClass} /></Field><Field label="Product details" hint="One detail per line, up to 30."><textarea rows={5} value={value.details} disabled={disabled} onChange={(e) => onChange({ ...value, details: e.target.value })} className={inputClass} /></Field><Field label="Images" hint="One supported storefront URL per line. Add optional alt text after a | character."><textarea rows={5} value={value.images} disabled={disabled} onChange={(e) => onChange({ ...value, images: e.target.value })} placeholder="/products/example.jpg | Front view" className={inputClass} /></Field><fieldset className="flex flex-wrap gap-5"><legend className="sr-only">Storefront settings</legend><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={value.isActive} disabled={disabled} onChange={(e) => onChange({ ...value, isActive: e.target.checked })} className="h-5 w-5 accent-forest" />Visible in storefront</label><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={value.featured} disabled={disabled} onChange={(e) => onChange({ ...value, featured: e.target.checked })} className="h-5 w-5 accent-forest" />Featured product</label></fieldset></div>;
}

function ExistingVariant({ product, variant, pending, onSaved, onAccess }: { product: AdminProductDetail; variant: AdminProductDetail["variants"][number]; pending: boolean; onSaved: (product: AdminProductDetail) => void; onAccess: (kind: "unauthenticated" | "forbidden") => void }) {
  const [draft, setDraft] = useState<VariantDraft>({ sku: variant.sku, size: variant.size ?? "", color: variant.color ?? "", price: variant.price });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current || pending) return; submitting.current = true; setSaving(true); setError(null);
    const result = await updateVariant(product, variant.id, draft);
    submitting.current = false; setSaving(false);
    if (result.kind === "ok") onSaved(result.data);
    else if (result.kind === "unauthenticated" || result.kind === "forbidden") onAccess(result.kind);
    else setError(message(result));
  }
  return <form onSubmit={submit} className="rounded-xl border border-ink/10 bg-paper/40 p-4"><VariantFields value={draft} disabled={pending || saving} onChange={setDraft} />{error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}<div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={pending || saving} className="min-h-11 rounded-xl border border-ink/20 bg-white px-4 text-sm font-semibold hover:bg-sand disabled:opacity-50">{saving ? "Saving..." : "Save variant"}</button><p className="text-xs text-ink/55">Variants cannot be deleted because the current schema has no safe archive state.</p></div></form>;
}

export function AdminProductCreateForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProductDraft>({ ...EMPTY_PRODUCT });
  const [variants, setVariants] = useState<VariantDraft[]>([{ ...EMPTY_VARIANT }]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [pending, setPending] = useState(false);
  const [access, setAccess] = useState<"unauthenticated" | "forbidden" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => { void fetchCategories().then((result) => { if (result.kind === "ok") setCategories(result.data); else if (result.kind === "unauthenticated" || result.kind === "forbidden") setAccess(result.kind); else setError(message(result)); }); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return; submitting.current = true; setPending(true); setError(null);
    const result = await createProduct(draft, variants);
    if (result.kind === "ok") { router.push(`/admin/products/${encodeURIComponent(result.data.id)}`); router.refresh(); return; }
    submitting.current = false; setPending(false);
    if (result.kind === "unauthenticated" || result.kind === "forbidden") setAccess(result.kind); else setError(message(result));
  }
  if (access) return <div role="alert" className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-950"><p>{message({ kind: access })}</p><Link href="/admin/login" className="mt-3 inline-flex font-semibold underline">Go to admin sign in</Link></div>;
  return <article><Link href="/admin/products" className="text-sm font-semibold text-forest underline">← Back to products</Link><div className="mt-5"><p className="text-xs font-semibold uppercase tracking-widest text-forest">New catalogue item</p><h1 className="mt-2 text-3xl font-semibold">Create product</h1><p className="mt-3 text-sm text-ink/65">New variants start with zero stock. Stock adjustments belong in inventory management.</p></div><form onSubmit={submit} className="mt-7 space-y-6"><section className="rounded-2xl border border-ink/10 p-5 sm:p-6"><h2 className="text-lg font-semibold">Product information</h2><div className="mt-5"><ProductFields value={draft} categories={categories} disabled={pending} onChange={setDraft} /></div></section><section className="rounded-2xl border border-ink/10 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Variants</h2><p className="mt-1 text-sm text-ink/60">Each size and colour combination needs a unique SKU.</p></div><button type="button" disabled={pending || variants.length >= 100} onClick={() => setVariants((current) => [...current, { ...EMPTY_VARIANT }])} className="min-h-11 rounded-xl border border-ink/20 px-4 text-sm font-semibold">Add variant</button></div><div className="mt-5 space-y-4">{variants.map((variant, index) => <div key={index} className="rounded-xl bg-paper/60 p-4"><div className="mb-3 flex justify-between"><h3 className="font-semibold">Variant {index + 1}</h3>{variants.length > 1 ? <button type="button" disabled={pending} onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm font-semibold text-red-800 underline">Remove draft</button> : null}</div><VariantFields value={variant} disabled={pending} onChange={(next) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} /></div>)}</div></section>{error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-900">{error}</p> : null}<button disabled={pending} className="min-h-11 rounded-xl bg-forest px-6 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">{pending ? "Creating product..." : "Create product"}</button></form></article>;
}

export function AdminProductEditForm({ productId }: { productId: string }) {
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [draft, setDraft] = useState<ProductDraft>({ ...EMPTY_PRODUCT });
  const [newVariant, setNewVariant] = useState<VariantDraft>({ ...EMPTY_VARIANT });
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [access, setAccess] = useState<"unauthenticated" | "forbidden" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => { void Promise.all([fetchProduct(productId), fetchCategories()]).then(([productResult, categoryResult]) => { const denied = [productResult, categoryResult].find((result) => result.kind === "unauthenticated" || result.kind === "forbidden"); if (denied?.kind === "unauthenticated" || denied?.kind === "forbidden") { setAccess(denied.kind); setLoading(false); return; } if (productResult.kind === "ok") { setProduct(productResult.data); setDraft(detailToDraft(productResult.data)); } else setError(message(productResult)); if (categoryResult.kind === "ok") setCategories(categoryResult.data); else setError(message(categoryResult)); setLoading(false); }); }, [productId]);
  function accept(next: AdminProductDetail, text: string) { setProduct(next); setDraft(detailToDraft(next)); setNotice(text); setError(null); }
  async function run(action: () => Promise<ApiResult<AdminProductDetail>>, success: string): Promise<boolean> {
    if (submitting.current) return false; submitting.current = true; setPending(true); setNotice(null); setError(null);
    const result = await action(); submitting.current = false; setPending(false);
    if (result.kind === "ok") { accept(result.data, success); return true; }
    if (result.kind === "unauthenticated" || result.kind === "forbidden") { setAccess(result.kind); return false; }
    setError(message(result)); return false;
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!product) return;
    if (product.isActive && !draft.isActive && !window.confirm(`Hide ${product.name} from the storefront?`)) return;
    void run(() => updateProduct(product, draft), "Product details saved.");
  }
  function archive() { if (!product || !product.isActive || !window.confirm(`Archive ${product.name}? It will no longer appear in the storefront.`)) return; void run(() => archiveProduct(product), "Product archived and hidden from the storefront."); }
  function addVariant(event: FormEvent) { event.preventDefault(); if (!product) return; void run(() => createVariant(product, newVariant), "Variant created with zero stock.").then((saved) => { if (saved) setNewVariant({ ...EMPTY_VARIANT }); }); }
  if (loading) return <p role="status" className="rounded-2xl bg-paper p-10 text-center text-sm">Loading product...</p>;
  if (access) return <div role="alert" className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-950"><p>{message({ kind: access })}</p><Link href="/admin/login" className="mt-3 inline-flex font-semibold underline">Go to admin sign in</Link></div>;
  if (!product) return <div role="alert" className="rounded-2xl bg-red-50 p-5 text-sm text-red-900"><p>{error ?? "Product could not be loaded."}</p><Link href="/admin/products" className="mt-3 inline-flex font-semibold underline">Back to products</Link></div>;
  return <article><Link href="/admin/products" className="text-sm font-semibold text-forest underline">← Back to products</Link><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-forest">Catalogue item</p><h1 className="mt-2 text-3xl font-semibold">{product.name}</h1><p className="mt-2 text-sm text-ink/55">/{product.slug}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${product.isActive ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>{product.isActive ? "Active" : "Archived"}</span></div><div aria-live="polite" className="mt-5 space-y-3">{notice ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p> : null}{error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-900">{error}</p> : null}</div><form onSubmit={save} className="mt-6 rounded-2xl border border-ink/10 p-5 sm:p-6"><h2 className="text-lg font-semibold">Product information</h2><div className="mt-5"><ProductFields value={draft} categories={categories} disabled={pending} onChange={setDraft} /></div><div className="mt-6 flex flex-wrap gap-3"><button disabled={pending} className="min-h-11 rounded-xl bg-forest px-6 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Save product"}</button>{product.isActive ? <button type="button" disabled={pending} onClick={archive} className="min-h-11 rounded-xl border border-red-800/30 px-5 text-sm font-semibold text-red-800 disabled:opacity-50">Archive product</button> : null}</div></form><section className="mt-6 rounded-2xl border border-ink/10 p-5 sm:p-6"><h2 className="text-lg font-semibold">Existing variants</h2><p className="mt-2 text-sm text-ink/60">Catalogue metadata and normal price only. Stock is not editable here.</p><div className="mt-5 space-y-4">{product.variants.map((variant) => <ExistingVariant key={`${variant.id}:${variant.updatedAt}`} product={product} variant={variant} pending={pending} onSaved={(next) => accept(next, "Variant saved.")} onAccess={setAccess} />)}</div></section><form onSubmit={addVariant} className="mt-6 rounded-2xl border border-ink/10 p-5 sm:p-6"><h2 className="text-lg font-semibold">Add variant</h2><p className="mt-2 text-sm text-ink/60">The inventory record will be initialized at zero stock.</p><div className="mt-5"><VariantFields value={newVariant} disabled={pending} onChange={setNewVariant} /></div><button disabled={pending} className="mt-5 min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Add variant"}</button></form></article>;
}
