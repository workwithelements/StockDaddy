"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  OrderedBatch,
  StockLocationEntry,
  ProductGroupRow,
  SkuDashboardRow,
} from "@/lib/types";
import StatusBadge from "./StatusBadge";

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
  ids: Set<string>;
  bySku: Record<string, OrderedBatch>;
}

export default function ProductStockPage({ productId, onBack }: Props) {
  const [product, setProduct] = useState<ProductData | null>(null);
  const [dashboardGroup, setDashboardGroup] = useState<ProductGroupRow | null>(null);
  const [locations, setLocations] = useState<Record<string, StockLocationEntry>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newPoQtys, setNewPoQtys] = useState<Record<string, number>>({});
  const [newPoEta, setNewPoEta] = useState<string>("");
  const [showNewPo, setShowNewPo] = useState(false);
  const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [planRes, locRes, dashRes] = await Promise.all([
      fetch("/api/order-plan?window=14"),
      fetch("/api/stock-locations"),
      fetch("/api/dashboard"),
    ]);
    const planData = await planRes.json();
    const locData = await locRes.json();
    const dashData = await dashRes.json();
    const group = planData.groups.find(
      (g: ProductData) => g.productId === productId
    );
    if (group) setProduct(group);
    setLocations(locData.locations || {});
    const dGroup = (dashData.groups as ProductGroupRow[]).find(
      (g) => g.productId === productId
    );
    setDashboardGroup(dGroup ?? null);
    setNewPoQtys({});
    setNewPoEta("");
    setShowNewPo(false);
    setEtaDrafts({});
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const purchaseOrders: PoView[] = useMemo(() => {
    if (!product) return [];
    const map = new Map<string, PoView>();
    for (const v of product.variants) {
      const entry = locations[v.sku];
      const batches = entry?.orderedBatches ?? [];
      for (const b of batches) {
        const key = `${b.placedDate ?? ""}|${b.expectedDate ?? ""}|${b.id}`;
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
    // Re-group by placedDate+expectedDate, merging across SKUs that share a logical PO.
    const merged = new Map<string, PoView>();
    for (const po of map.values()) {
      const mkey = `${po.placedDate ?? ""}|${po.expectedDate ?? ""}`;
      const existing = merged.get(mkey);
      if (existing) {
        Object.assign(existing.bySku, po.bySku);
        for (const id of po.ids) existing.ids.add(id);
      } else {
        merged.set(mkey, { ...po, key: mkey });
      }
    }
    return [...merged.values()].sort((a, b) => {
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

  async function deleteBatchPo(po: PoView, action: "delete" | "receive") {
    if (busy) return;
    const verb = action === "delete" ? "Deleted" : "Marked as received";
    setBusy(true);
    try {
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

  async function commitEtaChange(po: PoView, newDate: string) {
    if (busy) return;
    setBusy(true);
    try {
      for (const id of po.ids) {
        await fetch("/api/stock-locations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updateBatch: { batchId: id, expectedDate: newDate || undefined },
          }),
        });
      }
      await fetchData();
      showToast("ETA updated");
    } catch {
      showToast("Update failed");
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
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading stock locations...
        </div>
      </div>
    );
  }

  const totalCurrentStock = product.variants.reduce((s, v) => s + v.currentStock, 0);
  const totalOnOrder = purchaseOrders.reduce(
    (s, po) => s + Object.values(po.bySku).reduce((a, b) => a + b.qty, 0),
    0
  );
  const dashboardBySku = new Map<string, SkuDashboardRow>();
  for (const v of dashboardGroup?.variants ?? []) dashboardBySku.set(v.sku, v);

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
            On order: {totalOnOrder}
            {purchaseOrders.length > 0 &&
              ` (${purchaseOrders.length} batch${purchaseOrders.length === 1 ? "" : "es"})`}
            {dashboardGroup && (
              <>
                {" · "}Avg/day {dashboardGroup.totalAvgDailyRate.toFixed(1)}
                {" · "}Days left{" "}
                {dashboardGroup.minDaysUntilStockout !== null
                  ? dashboardGroup.minDaysUntilStockout
                  : "—"}
              </>
            )}
          </p>
        </div>
      </div>

      {dashboardGroup && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-gray-700 text-sm">
            Reorder Analysis
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium text-gray-500">Variant</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">Stock</th>
                <th className="text-right px-4 py-2 font-medium text-amber-700 bg-amber-50/40">On Order</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">Avg/Day</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">Days Left</th>
                <th className="text-center px-4 py-2 font-medium text-gray-500">Status</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">Order Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {product.variants.map((v) => {
                const d = dashboardBySku.get(v.sku);
                return (
                  <tr key={v.sku} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-900">{v.variantTitle}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                      {d?.currentStock ?? v.currentStock}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums bg-amber-50/20 text-amber-700">
                      {d && d.pipelineStock > 0 ? d.pipelineStock : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                      {d ? d.avgDailySellRate.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                      {d && d.daysUntilStockout !== null ? d.daysUntilStockout : "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {d ? <StatusBadge status={d.reorderStatus} /> : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {d && d.moqSuggestedQty > 0 ? d.moqSuggestedQty : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-700">Total</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {dashboardGroup.totalStock}
                </td>
                <td className="px-4 py-2 text-right tabular-nums bg-amber-50/30 text-amber-700">
                  {dashboardGroup.totalPipelineStock > 0
                    ? dashboardGroup.totalPipelineStock
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {dashboardGroup.totalAvgDailyRate.toFixed(1)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {dashboardGroup.minDaysUntilStockout ?? "—"}
                </td>
                <td className="px-4 py-2 text-center">
                  <StatusBadge status={dashboardGroup.worstStatus} />
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {dashboardGroup.totalSuggestedReorderQty > 0
                    ? dashboardGroup.totalSuggestedReorderQty
                    : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">Open Orders</h3>
        <button
          onClick={() => setShowNewPo((s) => !s)}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          {showNewPo ? "Cancel" : "+ Add batch"}
        </button>
      </div>

      {showNewPo && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm font-medium text-gray-700">Expected Arrival</label>
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

      {purchaseOrders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-8 text-center text-sm text-gray-400">
          No open orders for this product.
        </div>
      ) : (
        <div className="space-y-4">
          {purchaseOrders.map((po, idx) => {
            const total = Object.values(po.bySku).reduce((a, b) => a + b.qty, 0);
            const draftEta =
              etaDrafts[po.key] !== undefined ? etaDrafts[po.key] : po.expectedDate ?? "";
            const etaChanged = draftEta !== (po.expectedDate ?? "");
            return (
              <div key={po.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-amber-50/50 border-b border-amber-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm flex items-center gap-3 flex-wrap">
                    <span className="font-medium text-gray-900">Order #{idx + 1}</span>
                    {po.placedDate && (
                      <span className="text-gray-500">placed {po.placedDate}</span>
                    )}
                    <span className="flex items-center gap-2">
                      <span className="text-gray-700">ETA</span>
                      <input
                        type="date"
                        value={draftEta}
                        onChange={(e) =>
                          setEtaDrafts((p) => ({ ...p, [po.key]: e.target.value }))
                        }
                        className="border border-amber-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {etaChanged && (
                        <>
                          <button
                            onClick={() => commitEtaChange(po, draftEta)}
                            disabled={busy}
                            className="px-2 py-0.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() =>
                              setEtaDrafts((p) => {
                                const next = { ...p };
                                delete next[po.key];
                                return next;
                              })
                            }
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 mr-2">
                      {total} units
                    </span>
                    <button
                      onClick={() => deleteBatchPo(po, "receive")}
                      disabled={busy}
                      className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 rounded hover:bg-emerald-200 disabled:opacity-50"
                      title="Mark as received — removes the batch."
                    >
                      ✓ Received
                    </button>
                    <button
                      onClick={() => deleteBatchPo(po, "delete")}
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
        Edit a batch&apos;s ETA inline to revise supplier estimates. On-order quantities feed the reorder math. When stock arrives in Shopify the next sync deducts the batch automatically (FIFO by ETA).
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
