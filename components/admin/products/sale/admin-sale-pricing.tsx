"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { fetchVariantSale, updateVariantSale } from "./sale-api";
import {
  clearSalePayload,
  createSaleEditorState,
  discountPreview,
  formatAdminMoney,
  saleEditorReducer,
  saleMutationPayload,
  saleStateLabel,
  validateSaleDraft,
  type SaleDraft,
  type SaleDraftErrors,
  type SaleEditorState,
  type SaleMutationPayload,
} from "./sale-ui";

type AccessFailure = "unauthenticated" | "forbidden" | "not-found" | "error";
const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-normal text-neutral-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-500 disabled:bg-neutral-50 disabled:opacity-70";

function AccessState({ failure, productId }: { failure: AccessFailure; productId: string }) {
  const text = failure === "unauthenticated" ? "Your admin session has expired."
    : failure === "forbidden" ? "This account no longer has permission to manage sale pricing."
      : failure === "not-found" ? "This product variant could not be found."
        : "Sale pricing could not be loaded.";
  const signIn = failure === "unauthenticated" || failure === "forbidden";
  return <div role="alert" className="rounded-2xl bg-neutral-50 p-6 text-sm text-neutral-900"><p>{text}</p><Link href={signIn ? "/admin/login" : `/admin/products/${encodeURIComponent(productId)}`} className="mt-3 inline-flex font-semibold underline">{signIn ? "Go to admin sign in" : "Back to product"}</Link></div>;
}

function fieldError(error: string | undefined, id: string) {
  return error ? <span id={id} className="mt-1 block text-xs font-normal text-neutral-900">{error}</span> : null;
}

export function SalePricingForm({
  editor,
  errors,
  pending,
  onChange,
  onSave,
  onRemove,
  onReload,
}: {
  editor: SaleEditorState;
  errors: SaleDraftErrors;
  pending: boolean;
  onChange: (draft: SaleDraft) => void;
  onSave: (event: FormEvent) => void;
  onRemove: () => void;
  onReload: () => void;
}) {
  const { sale, draft, message, conflict } = editor;
  const preview = discountPreview(sale.normalPrice, draft.salePrice);
  const stateClass = sale.state === "ACTIVE" ? "bg-neutral-200 text-neutral-900"
    : sale.state === "SCHEDULED" ? "bg-neutral-50 text-neutral-900"
      : sale.state === "EXPIRED" ? "bg-neutral-50 text-neutral-900"
        : "bg-neutral-100 text-neutral-900";
  const hasConfiguration = sale.salePrice !== null || sale.saleStartsAt !== null || sale.saleEndsAt !== null;

  return <form onSubmit={onSave} className="mt-7 rounded-2xl border border-neutral-300 bg-neutral-50/40 p-5 sm:p-6" aria-busy={pending}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Pricing</h2><p className="mt-1 text-sm text-neutral-600">Schedule is entered as South Africa time (SAST / UTC+02:00).</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${stateClass}`}>{saleStateLabel(sale.state)}</span></div>
    <dl className="mt-6 grid gap-4 rounded-xl bg-white p-4 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Normal price</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatAdminMoney(sale.normalPrice)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Effective price</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatAdminMoney(sale.effectivePrice)}</dd></div></dl>
    <div className="mt-6 grid gap-5">
      <label className="block text-sm font-semibold">Sale price<input aria-invalid={Boolean(errors.salePrice)} aria-describedby={errors.salePrice ? "sale-price-error" : undefined} inputMode="decimal" autoComplete="off" value={draft.salePrice} onChange={(event) => onChange({ ...draft, salePrice: event.target.value })} disabled={pending} placeholder="1199.00" className={inputClass} />{fieldError(errors.salePrice, "sale-price-error")}</label>
      <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-semibold">Starts <span className="font-normal text-neutral-600">(optional)</span><input aria-invalid={Boolean(errors.saleStartsAt)} aria-describedby={errors.saleStartsAt ? "sale-start-error" : undefined} type="datetime-local" step="0.001" value={draft.saleStartsAt} onChange={(event) => onChange({ ...draft, saleStartsAt: event.target.value })} disabled={pending} className={inputClass} />{fieldError(errors.saleStartsAt, "sale-start-error")}</label><label className="block text-sm font-semibold">Ends <span className="font-normal text-neutral-600">(optional)</span><input aria-invalid={Boolean(errors.saleEndsAt)} aria-describedby={errors.saleEndsAt ? "sale-end-error" : undefined} type="datetime-local" step="0.001" value={draft.saleEndsAt} onChange={(event) => onChange({ ...draft, saleEndsAt: event.target.value })} disabled={pending} className={inputClass} />{fieldError(errors.saleEndsAt, "sale-end-error")}</label></div>
    </div>
    {preview ? <div className="mt-5 rounded-xl border border-neutral-300 bg-white p-4"><p className="font-semibold text-neutral-900">{preview.percent}% off</p><p className="mt-1 text-sm text-neutral-600">You save {preview.saving}. Preview only; the server validates the sale.</p></div> : null}
    <div aria-live="polite" className="mt-5 space-y-3">{message ? <div role={message.kind === "error" ? "alert" : "status"} className={`rounded-xl p-4 text-sm ${message.kind === "success" ? "bg-neutral-200 text-neutral-900" : message.kind === "warning" ? "bg-neutral-50 text-neutral-900" : "bg-neutral-100 text-neutral-900"}`}><p>{message.text}</p>{conflict ? <button type="button" disabled={pending} onClick={onReload} className="mt-3 min-h-11 rounded-xl border border-current px-4 font-semibold disabled:opacity-50">Reload latest</button> : null}</div> : null}</div>
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><div>{hasConfiguration ? <button type="button" disabled={pending} onClick={onRemove} className="min-h-11 rounded-xl border border-neutral-500/30 px-5 text-sm font-semibold text-neutral-900 disabled:opacity-50">{pending ? "Saving..." : "Remove sale"}</button> : null}</div><button disabled={pending} className="min-h-11 rounded-xl bg-black px-6 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">{pending ? "Saving sale..." : "Save sale"}</button></div>
    {hasConfiguration ? <p className="mt-4 text-xs text-neutral-600">Remove sale clears only the sale configuration. The normal price remains unchanged.</p> : null}
  </form>;
}

export function AdminSalePricing({ productId, variantId }: { productId: string; variantId: string }) {
  const [editor, setEditor] = useState<SaleEditorState | null>(null);
  const [errors, setErrors] = useState<SaleDraftErrors>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AccessFailure | null>(null);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setFailure(null);
    const result = await fetchVariantSale(productId, variantId);
    if (result.kind === "ok") {
      setEditor(createSaleEditorState(result.data)); setErrors({});
    } else {
      setFailure(result.kind === "unauthenticated" || result.kind === "forbidden" || result.kind === "not-found" ? result.kind : "error");
    }
    setLoading(false);
  }, [productId, variantId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function change(draft: SaleDraft) {
    setEditor((current) => current ? saleEditorReducer(current, { type: "change", draft }) : current);
    setErrors({});
  }

  async function mutate(payload: SaleMutationPayload, success: string) {
    if (!editor || submitting.current) return;
    submitting.current = true; setPending(true); setErrors({});
    setEditor((current) => current ? saleEditorReducer(current, { type: "message", message: null }) : current);
    const result = await updateVariantSale(productId, variantId, payload);
    if (result.kind === "ok") {
      setEditor((current) => current ? saleEditorReducer(current, { type: "canonical", sale: result.data, message: success }) : createSaleEditorState(result.data));
    } else if (result.kind === "conflict") {
      setEditor((current) => current ? saleEditorReducer(current, {
        type: "conflict",
        message: result.message ?? "This product changed after you opened the sale editor. Reload the latest sale settings before saving again.",
      }) : current);
    } else if (result.kind === "invalid") {
      setEditor((current) => current ? saleEditorReducer(current, { type: "message", message: { kind: "error", text: result.message ?? "Review the sale price and schedule, then try again." } }) : current);
    } else if (result.kind === "unauthenticated" || result.kind === "forbidden" || result.kind === "not-found") {
      setFailure(result.kind);
    } else {
      setEditor((current) => current ? saleEditorReducer(current, { type: "message", message: { kind: "error", text: "Sale pricing could not be saved. Please try again." } }) : current);
    }
    submitting.current = false; setPending(false);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || submitting.current) return;
    const nextErrors = validateSaleDraft(editor.draft, editor.sale.normalPrice);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    void mutate(saleMutationPayload(editor.sale, editor.draft), "Sale pricing saved.");
  }

  function remove() {
    if (!editor || submitting.current) return;
    if (!window.confirm("Remove this sale configuration? The normal price will remain unchanged.")) return;
    void mutate(clearSalePayload(editor.sale), "Sale removed. The normal price is unchanged.");
  }

  if (loading) return <p role="status" className="rounded-2xl bg-neutral-50 p-10 text-center text-sm">Loading sale pricing...</p>;
  if (failure) return <AccessState failure={failure} productId={productId} />;
  if (!editor) return <AccessState failure="error" productId={productId} />;

  return <article><Link href={`/admin/products/${encodeURIComponent(productId)}`} className="text-sm font-semibold text-neutral-900 underline">← Back to product</Link><div className="mt-5"><p className="text-xs font-semibold uppercase tracking-widest text-neutral-900">Variant pricing</p><h1 className="mt-2 text-3xl font-semibold">Sale pricing</h1><p className="mt-3 text-sm text-neutral-600">SKU {editor.sale.sku}{editor.sale.size ? ` · ${editor.sale.size}` : ""}{editor.sale.color ? ` · ${editor.sale.color}` : ""}</p></div><SalePricingForm editor={editor} errors={errors} pending={pending} onChange={change} onSave={save} onRemove={remove} onReload={() => void load()} /></article>;
}
