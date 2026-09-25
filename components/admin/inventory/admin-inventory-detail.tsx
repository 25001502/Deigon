"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  createInventoryAdjustment,
  fetchInventoryAdjustments,
  fetchInventoryDetail,
} from "./inventory-api";
import {
  dateTime,
  EMPTY_ADJUSTMENT,
  reasonLabel,
  stockStateLabel,
  type AdjustmentDraft,
  type InventoryAdjustment,
  type InventoryItem,
} from "./inventory-ui";

type AccessFailure = "unauthenticated" | "forbidden" | "not-found" | "error";

function AccessState({ failure }: { failure: AccessFailure }) {
  const text = failure === "unauthenticated" ? "Your admin session has expired."
    : failure === "forbidden" ? "This account no longer has permission to manage inventory."
      : failure === "not-found" ? "This product variant could not be found."
        : "Inventory could not be loaded.";
  return <div role="alert" className="rounded-2xl bg-amber-50 p-6 text-sm text-amber-950"><p>{text}</p><Link href={failure === "unauthenticated" || failure === "forbidden" ? "/admin/login" : "/admin/inventory"} className="mt-3 inline-flex font-semibold underline">{failure === "unauthenticated" || failure === "forbidden" ? "Go to admin sign in" : "Back to inventory"}</Link></div>;
}

function AdjustmentHistory({ adjustments }: { adjustments: InventoryAdjustment[] }) {
  if (!adjustments.length) return <p className="rounded-2xl border border-dashed border-ink/20 px-5 py-8 text-center text-sm text-ink/60">No manual adjustments have been recorded.</p>;
  return <ol className="space-y-3">{adjustments.map((adjustment) => <li key={adjustment.id} className="rounded-2xl border border-ink/10 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{reasonLabel(adjustment.reason)}</p><p className="mt-1 text-sm text-ink/65">{adjustment.administrator.email} · {dateTime(adjustment.createdAt)}</p></div><p className={`text-lg font-semibold tabular-nums ${adjustment.quantityDelta > 0 ? "text-emerald-700" : "text-red-700"}`}>{adjustment.quantityDelta > 0 ? "+" : ""}{adjustment.quantityDelta}</p></div><p className="mt-3 text-sm tabular-nums">{adjustment.quantityBefore} {adjustment.quantityDelta >= 0 ? "+" : "−"} {Math.abs(adjustment.quantityDelta)} = <strong>{adjustment.quantityAfter}</strong></p>{adjustment.note ? <p className="mt-3 whitespace-pre-wrap text-sm text-ink/70">{adjustment.note}</p> : null}</li>)}</ol>;
}

export function AdminInventoryDetail({ variantId }: { variantId: string }) {
  const [detail, setDetail] = useState<InventoryItem | null>(null);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdjustmentDraft>({ ...EMPTY_ADJUSTMENT });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AccessFailure | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "warning" | "error"; text: string } | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setFailure(null);
    const [detailResult, historyResult] = await Promise.all([
      fetchInventoryDetail(variantId),
      fetchInventoryAdjustments(variantId, null),
    ]);
    if (detailResult.kind !== "ok") {
      setFailure(detailResult.kind === "unauthenticated" || detailResult.kind === "forbidden" || detailResult.kind === "not-found" ? detailResult.kind : "error");
      setLoading(false); return false;
    }
    if (historyResult.kind !== "ok") {
      setFailure(historyResult.kind === "unauthenticated" || historyResult.kind === "forbidden" || historyResult.kind === "not-found" ? historyResult.kind : "error");
      setLoading(false); return false;
    }
    setDetail(detailResult.data); setAdjustments(historyResult.data.adjustments); setNextCursor(historyResult.data.nextCursor);
    setLoading(false); return true;
  }, [variantId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function changeDraft(next: AdjustmentDraft) {
    setDraft(next);
    idempotencyKey.current = null;
    setMessage(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!detail || detail.inventory.quantity === null || !detail.inventory.updatedAt || pending) return;
    const delta = Number(draft.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      setMessage({ kind: "error", text: "Enter a non-zero whole-number delta." });
      return;
    }
    setPending(true); setMessage(null);
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    const result = await createInventoryAdjustment(detail, draft, key);
    if (result.kind === "ok") {
      setDetail(result.data.inventory);
      setAdjustments((items) => items.some((item) => item.id === result.data.adjustment.id) ? items : [result.data.adjustment, ...items]);
      setDraft({ ...EMPTY_ADJUSTMENT }); idempotencyKey.current = null;
      setMessage({ kind: "success", text: result.data.replayed ? "This adjustment was already recorded; no duplicate stock movement occurred." : "Inventory adjustment recorded." });
    } else if (result.kind === "conflict") {
      // Never retry a stale mutation. Refresh once and require a deliberate new submit.
      idempotencyKey.current = null;
      const refreshed = await load();
      setMessage({ kind: "warning", text: refreshed ? "Stock changed before this adjustment. Review the refreshed quantity before submitting again." : "Stock changed, but the latest inventory could not be loaded." });
    } else if (result.kind === "unauthenticated" || result.kind === "forbidden" || result.kind === "not-found") {
      setFailure(result.kind); idempotencyKey.current = null;
    } else if (result.kind === "invalid") {
      setMessage({ kind: "error", text: "Review the adjustment fields and try again." }); idempotencyKey.current = null;
    } else {
      // Retain the key for a deliberate retry after an ambiguous network/server failure.
      setMessage({ kind: "error", text: "The adjustment result could not be confirmed. Retry to safely check the same request." });
    }
    setPending(false);
  }

  async function loadMore() {
    if (!nextCursor || pending) return;
    setPending(true);
    const result = await fetchInventoryAdjustments(variantId, nextCursor);
    if (result.kind === "ok") {
      setAdjustments((items) => [...items, ...result.data.adjustments]); setNextCursor(result.data.nextCursor);
    } else setMessage({ kind: "error", text: "More adjustment history could not be loaded." });
    setPending(false);
  }

  if (loading) return <p role="status" className="rounded-2xl bg-paper p-10 text-center text-sm">Loading inventory detail...</p>;
  if (failure) return <AccessState failure={failure} />;
  if (!detail) return <AccessState failure="error" />;
  const delta = Number(draft.delta);
  const preview = Number.isInteger(delta) && detail.inventory.quantity !== null ? detail.inventory.quantity + delta : null;

  return <section aria-labelledby="inventory-detail-heading"><Link href="/admin/inventory" className="text-sm font-semibold text-forest underline">Back to inventory</Link><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-forest">{detail.product.category.name}</p><h1 id="inventory-detail-heading" className="mt-2 text-3xl font-semibold">{detail.product.name}</h1><p className="mt-2 text-sm text-ink/65">SKU {detail.variant.sku}{detail.variant.size ? ` · ${detail.variant.size}` : ""}{detail.variant.color ? ` · ${detail.variant.color}` : ""}</p></div><span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${detail.product.isActive ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-950"}`}>{detail.product.isActive ? "Active product" : "Archived product"}</span></div>
    {!detail.product.isActive ? <div role="status" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><strong>Archived product.</strong> Stock remains adjustable for reconciliation, but this product is hidden from the storefront.</div> : null}
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]"><div><div className="rounded-2xl border border-ink/10 bg-white p-6"><p className="text-sm text-ink/55">Authoritative quantity</p><p className="mt-2 text-5xl font-semibold tabular-nums">{detail.inventory.quantity ?? "—"}</p><p className="mt-3 text-sm font-semibold">{stockStateLabel(detail.inventory.state)}</p>{detail.inventory.updatedAt ? <p className="mt-2 text-xs text-ink/50">Updated {dateTime(detail.inventory.updatedAt)}</p> : <p className="mt-3 text-sm text-red-700">This variant has no Inventory row. Adjustments are blocked until the data invariant is repaired.</p>}</div>
      <div className="mt-8"><h2 className="text-xl font-semibold">Manual adjustment history</h2><p className="mt-2 text-sm text-ink/65">Immutable records of administrator stock changes. Checkout reservations and automatic restorations are operational movements and are not listed here.</p><div className="mt-5"><AdjustmentHistory adjustments={adjustments} /></div>{nextCursor ? <button type="button" disabled={pending} onClick={() => void loadMore()} className="mt-4 min-h-11 rounded-xl border border-ink/20 px-4 text-sm font-semibold disabled:opacity-50">Load more history</button> : null}</div></div>
      <form onSubmit={submit} className="h-fit rounded-2xl border border-ink/10 bg-paper/60 p-6"><h2 className="text-xl font-semibold">Adjust stock</h2><p className="mt-2 text-sm text-ink/65">Use a positive delta to restock or a negative delta to record a reduction.</p><label className="mt-5 block text-sm font-semibold">Quantity delta<input name="delta" inputMode="numeric" required value={draft.delta} onChange={(event) => changeDraft({ ...draft, delta: event.target.value })} placeholder="+20 or -2" disabled={pending || detail.inventory.quantity === null} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3 disabled:opacity-50" /></label><label className="mt-4 block text-sm font-semibold">Reason<select name="reason" value={draft.reason} onChange={(event) => changeDraft({ ...draft, reason: event.target.value as AdjustmentDraft["reason"] })} disabled={pending || detail.inventory.quantity === null} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3 disabled:opacity-50"><option value="RESTOCK">Restock</option><option value="CORRECTION">Correction</option><option value="DAMAGE">Damage</option><option value="RETURN">Return</option><option value="OTHER">Other</option></select></label><label className="mt-4 block text-sm font-semibold">Note <span className="font-normal text-ink/50">(optional)</span><textarea name="note" maxLength={500} rows={4} value={draft.note} onChange={(event) => changeDraft({ ...draft, note: event.target.value })} disabled={pending || detail.inventory.quantity === null} className="mt-2 w-full rounded-xl border border-ink/20 bg-white p-3 disabled:opacity-50" /></label>{preview !== null ? <p className={`mt-4 rounded-xl p-3 text-center text-lg font-semibold tabular-nums ${preview < 0 ? "bg-red-50 text-red-800" : "bg-white"}`}>{detail.inventory.quantity} {delta >= 0 ? "+" : "−"} {Math.abs(delta)} = {preview}</p> : null}{message ? <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${message.kind === "success" ? "bg-emerald-50 text-emerald-900" : message.kind === "warning" ? "bg-amber-50 text-amber-950" : "bg-red-50 text-red-900"}`}>{message.text}</p> : null}<button disabled={pending || detail.inventory.quantity === null || preview === null || preview < 0} className="mt-5 min-h-12 w-full rounded-xl bg-ink px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving adjustment..." : "Record adjustment"}</button></form></div>
  </section>;
}
