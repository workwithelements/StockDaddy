"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { OrderedBatch, StockLocationEntry } from "@/lib/types";

interface ProductVariant {
  variantTitle: string;
  sku: string;
  currentStock: number;
  avgDailySellRate: number;
}

interface ProductData {
  productId: string;
  productTitle: string;
  imageUrl?: string;
  variants: ProductVariant[];
}

interface Props {
  productId: string;
  onBack: () => void;
}

interface PoView {
  key: string;
  expectedDate?: string;
  placedDate?: string;
  ids: Set<string>; // unique batchIds across variants in this PO
  bySku: Record<string, OrderedBatch>;
}

export default function ProductStockPage({ productId, onBack }: Props) {
  const [product, setProduct] = useState<ProductData | null>(null);
  const [locations, setLocations] = useState<Record<string, StockLocationEntry>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Form state for the "add new order" panel.
  const [newPoQtys, setNewPoQtys] = useState<Record<string, number>>({});
  const [newPoEta, setNewPoEta] = useState<string>("");
  const [showNewPo, setShowNewPo] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [planRes, locRes] = await Promise.all([
      fetch("/api/order-plan?window=14"),
      fetch("/api/stock-locations"),
    ]);
    const planData = await planRes.json();
    const locData = await locRes.json();
    const group = planData.groups.find(
      (g: ProductData) => g.productId === productId
    );
    if (group) setProduct(group);
    setLocations(locData.locations || {});
    setNewPoQtys({});
    setNewPoEta("");
    setShowNewPo(false);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group batches into "logical POs" by shared placedDate + expectedDate.
  const purchaseOrders: PoView[] = useMemo(() => {
    if (!product) return [];
    const map = new Map<string, PoView>();
    for (const v of product.variants) {
      const entry = locations[v.sku];
      const batches = entry?.orderedBatches ?? [];
      for (const b of batches) {
        const key = `${b.placedDate ?? ""}|${b.expectedDate ?? ""}`;
        const existing = map.get(key);
        if (existing) {
          existing.bySku[v.sku] = b;
          existing.ids.add(b.id);
        } else {
          map.set(key, {
            key,
            placedDate: b.placedDate,
            expectedDate: b.expectedDate,
            bySku: { [v.sku]: b },
            ids: new Set([b.id]),
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.expectedDate && b.expectedDate) return a.expectedDate.localeCompare(b.expectedDate);
      if (a.expectedDate) return -1;
      if (b.expectedDate) return 1;
      return 0;
    });
  }, [product, locations]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function deleteBatch(po: PoView, action: "delete" | "receive") {
    if (busy || !product) return;
    const verb = action === "delete" ? "Deleted" : "Marked as received";
    setBusy(true);
    try {
      // Each PO is identified by the set of batch ids belonging to its lines.
      // Delete every batch in that set so the PO disappears across all variants.
      for (const id of po.ids) {
        await fetch("/api/stock-locations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "delete"
              ? { deleteBatch: { batchId: id } }
              : { receiveBatch: { batchId: id } }
          ),
        });
      }
      await fetchData();
      showToast(`${verb} order`);
    } catch {
      showToast("Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function commitNewPo() {
    if (!product) return;
    const items: Record<string, number> = {};
    for (const [sku, qty] of Object.entries(newPoQtys)) {
      if (qty > 0) items[sku] = qty;
    }
    if (Object.keys(items).length === 0) {
      showToast("Enter quantities first");
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/stock-locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addBatch: {
            expectedDate: newPoEta || undefined,
            placedDate: new Date().toISOString().split("T")[0],
            items,
          },
        }),
      });
      await fetchData();
      showToast("Order added");
    } catch {
      showToast("Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !product) {
    return (
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading stock locations...
        </div>
      </div>
    );
  }

  const totalCurrentStock = product.variants.reduce(
    (s, v) => s + v.currentStock,
    0
  );
  const totalOnOrder = purchaseOrders.reduce(
    (s, po) =>
      s + Object.values(po.bySku).reduce((a, b) => a + b.qty, 0),
    0
  );

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="flex items-center gap-4 mb-6">
        {product.imageUrl && (
          <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
        )}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {product.productTitle}
          </h2>
          <p className="text-sm text-gray-500">
            {product.variants.length} variants &middot; Stock: {totalCurrentStock} &middot;{" "}
            On order: {totalOnOrder} {purchaseOrders.length > 0 && `(${purchaseOrders.length} batch${purchaseOrders.length === 1 ? "" : "es"})`}
          </p>
        </div>
      </div>

      {/* Current stock (read-only summary) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-700 text-sm">
          Current Stock (Shopify)
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2 font-medium text-gray-500">Variant</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {product.variants.map((v) => (
              <tr key={v.sku}>
                <td className="px-4 py-2 text-gray-900">{v.variantTitle}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                  {v.currentStock}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Open orders */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">Open Orders</h3>
        <button
          onClick={() => setShowNewPo((s) => !s)}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          {showNewPo ? "Cancel" : "+ Add batch"}
        </button>
      </div>

      {/* New PO form */}
      {showNewPo && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm font-medium text-gray-700">
              Expected Arrival
            </label>
            <input
              type="date"
              value={newPoEta}
              onChange={(e) => setNewPoEta(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-amber-200/60">
                <th className="text-left px-2 py-2 font-medium text-gray-600">Variant</th>
                <th className="text-right px-2 py-2 font-medium text-gray-600">Qty</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.sku}>
                  <td className="px-2 py-1.5 text-gray-900">{v.variantTitle}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      value={newPoQtys[v.sku] ?? 0}
                      onChange={(e) =>
                        setNewPoQtys((p) => ({
                          ...p,
                          [v.sku]: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                      className="w-24 text-right tabular-nums border border-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-amber-200/60">
                <td className="px-2 py-1.5 font-medium text-gray-700">Total</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                  {Object.values(newPoQtys).reduce((s, q) => s + q, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => {
                setNewPoQtys({});
                setNewPoEta("");
                setShowNewPo(false);
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={commitNewPo}
              disabled={busy}
              className="px-3 py-1.5 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? "Saving..." : "Add as new order"}
            </button>
          </div>
        </div>
      )}

      {/* Existing POs */}
      {purchaseOrders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-8 text-center text-sm text-gray-400">
          No open orders for this product.
        </div>
      ) : (
        <div className="space-y-4">
          {purchaseOrders.map((po, idx) => {
            const total = Object.values(po.bySku).reduce((a, b) => a + b.qty, 0);
            return (
              <div key={po.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-amber-50/50 border-b border-amber-100 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">
                      Order #{idx + 1}
                    </span>
                    {po.placedDate && (
                      <span className="ml-3 text-gray-500">
                        placed {po.placedDate}
                      </span>
                    )}
                    {po.expectedDate && (
                      <span className="ml-3 text-amber-700 font-medium">
                        ETA {po.expectedDate}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 mr-2">
                      {total} units
                    </span>
                    <button
                      onClick={() => deleteBatch(po, "receive")}
                      disabled={busy}
                      className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 rounded hover:bg-emerald-200 disabled:opacity-50"
                      title="Mark as received — removes the batch. Auto-reconcile would do this too once Shopify shows the inventory bump."
                    >
                      ✓ Received
                    </button>
                    <button
                      onClick={() => deleteBatch(po, "delete")}
                      disabled={busy}
                      className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
                      title="Cancel / delete this PO"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Variant</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {product.variants.map((v) => {
                      const qty = po.bySku[v.sku]?.qty ?? 0;
                      return (
                        <tr key={v.sku}>
                          <td className="px-4 py-2 text-gray-900">{v.variantTitle}</td>
                          <td
                            className={`px-4 py-2 text-right tabular-nums ${
                              qty > 0 ? "text-gray-900 font-medium" : "text-gray-300"
                            }`}
                          >
                            {qty || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 text-xs text-gray-400">
        On-order quantities feed the dashboard&apos;s reorder math. When stock arrives in Shopify the next sync deducts the batch automatically (FIFO by ETA).
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
