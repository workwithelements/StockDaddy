"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

interface PlannerVariant {
  variantTitle: string;
  sku: string;
  currentStock: number;
  avgDailySellRate: number;
}

interface PlannerGroup {
  productId: string;
  productTitle: string;
  imageUrl?: string;
  variants: PlannerVariant[];
}

interface SizeSplit {
  variantTitle: string;
  sku: string;
  sellRate: number;
  proportion: number;
  qty: number;
  currentStock: number;
  postRestock: number;
}

type Window = 3 | 7 | 14 | 30;

interface OrderPlannerProps {
  onViewProduct: (productId: string) => void;
}

export default function OrderPlanner({ onViewProduct }: OrderPlannerProps) {
  const [groups, setGroups] = useState<PlannerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [orderQty, setOrderQty] = useState<number>(100);
  const [window, setWindow] = useState<Window>(30);
  const [addingToOrdered, setAddingToOrdered] = useState(false);
  // Per-SKU manual overrides for the suggested split. Cleared when product /
  // total qty / window changes so we don't carry stale edits across products.
  const [editedQtys, setEditedQtys] = useState<Record<string, number>>({});
  // ETA stamped on the batch we're about to commit (yyyy-mm-dd, or "" for none).
  const [batchEta, setBatchEta] = useState<string>("");

  const fetchData = useCallback((w: Window) => {
    setLoading(true);
    fetch(`/api/order-plan?window=${w}`)
      .then((r) => r.json())
      .then((data) => {
        setGroups(data.groups);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData(window);
  }, [window, fetchData]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.productId === selectedProductId) ?? null,
    [groups, selectedProductId]
  );

  // Reset edits when product / qty / window change so the suggested split
  // re-applies cleanly.
  useEffect(() => {
    setEditedQtys({});
  }, [selectedProductId, orderQty, window]);

  const suggestedSplit: SizeSplit[] = useMemo(() => {
    if (!selectedGroup || orderQty <= 0) return [];

    const variants = selectedGroup.variants;
    const totalRate = variants.reduce((s, v) => s + v.avgDailySellRate, 0);

    if (totalRate <= 0) {
      const even = Math.floor(orderQty / variants.length);
      const remainder = orderQty - even * variants.length;
      return variants.map((v, i) => {
        const qty = even + (i < remainder ? 1 : 0);
        return {
          variantTitle: v.variantTitle,
          sku: v.sku,
          sellRate: 0,
          proportion: 1 / variants.length,
          qty,
          currentStock: v.currentStock,
          postRestock: v.currentStock + qty,
        };
      });
    }

    const raw = variants.map((v) => {
      const proportion = v.avgDailySellRate / totalRate;
      const qty = Math.round(orderQty * proportion);
      return {
        variantTitle: v.variantTitle,
        sku: v.sku,
        sellRate: v.avgDailySellRate,
        proportion,
        qty,
        currentStock: v.currentStock,
        postRestock: v.currentStock + qty,
      };
    });

    const rawTotal = raw.reduce((s, r) => s + r.qty, 0);
    const diff = orderQty - rawTotal;
    if (diff !== 0) {
      const withFrac = raw.map((r, i) => ({
        i,
        frac: orderQty * r.proportion - Math.floor(orderQty * r.proportion),
      }));
      withFrac.sort((a, b) => b.frac - a.frac);
      for (let j = 0; j < Math.abs(diff); j++) {
        const idx = withFrac[j].i;
        raw[idx].qty += diff > 0 ? 1 : -1;
        raw[idx].postRestock = raw[idx].currentStock + raw[idx].qty;
      }
    }

    return raw;
  }, [selectedGroup, orderQty]);

  // Final split: apply per-SKU overrides on top of the suggestion.
  const sizeSplit: SizeSplit[] = useMemo(() => {
    return suggestedSplit.map((row) => {
      const override = editedQtys[row.sku];
      const qty = override !== undefined ? override : row.qty;
      return {
        ...row,
        qty,
        postRestock: row.currentStock + qty,
      };
    });
  }, [suggestedSplit, editedQtys]);

  const totalQty = sizeSplit.reduce((s, r) => s + r.qty, 0);
  const hasEdits = Object.keys(editedQtys).length > 0;

  function setRowQty(sku: string, value: string) {
    const n = Math.max(0, parseInt(value) || 0);
    setEditedQtys((prev) => ({ ...prev, [sku]: n }));
  }

  if (loading && groups.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        Loading products...
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Order Planner
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Select a product, enter total order quantity, and get the recommended
        size split based on current sell rates. Quantities are editable before
        committing.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Product
          </label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Select a product...</option>
            {groups.map((g) => (
              <option key={g.productId} value={g.productId}>
                {g.productTitle} ({g.variants.length} sizes)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Order Qty
          </label>
          <input
            type="number"
            min={1}
            value={orderQty}
            onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sell Rate Window
          </label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {([3, 7, 14, 30] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  w !== 3 ? "border-l border-gray-300" : ""
                } ${
                  window === w
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedGroup && sizeSplit.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
            {selectedGroup.imageUrl && (
              <img
                src={selectedGroup.imageUrl}
                alt=""
                className="w-8 h-8 rounded object-cover"
              />
            )}
            <div className="flex-1">
              <button
                onClick={() => onViewProduct(selectedGroup.productId)}
                className="font-medium text-gray-900 text-sm hover:text-indigo-600 hover:underline"
              >
                {selectedGroup.productTitle}
              </button>
              <div className="text-xs text-gray-500">
                {totalQty} units across {sizeSplit.length} sizes
                &middot; based on {window}-day sell rate
                {hasEdits && (
                  <span className="ml-2 text-amber-600">· edited</span>
                )}
              </div>
            </div>
            {hasEdits && (
              <button
                onClick={() => setEditedQtys({})}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Reset to suggested
              </button>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">
                  Size
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">
                  Order Qty
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">
                  % of Sales
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">
                  Avg/Day
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">
                  Current Stock
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">
                  Post Restock
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sizeSplit.map((row) => (
                <tr key={row.sku} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {row.variantTitle}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      value={row.qty}
                      onChange={(e) => setRowQty(row.sku, e.target.value)}
                      className="w-20 text-right tabular-nums border border-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {(row.proportion * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {row.sellRate.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {row.currentStock}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-green-700">
                    {row.postRestock}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                  {totalQty}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                  100%
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                  {sizeSplit.reduce((s, r) => s + r.sellRate, 0).toFixed(2)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                  {sizeSplit.reduce((s, r) => s + r.currentStock, 0)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-green-700">
                  {sizeSplit.reduce((s, r) => s + r.postRestock, 0)}
                </td>
              </tr>
            </tfoot>
          </table>

          {sizeSplit.every((r) => r.sellRate === 0) && (
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
              No sales data available for this product. Quantities have been
              distributed evenly across sizes.
            </div>
          )}
        </div>
      )}

      {selectedGroup && sizeSplit.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end justify-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Expected Arrival <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              value={batchEta}
              onChange={(e) => setBatchEta(e.target.value)}
              required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Required so this batch can be planned in Days Left.
            </p>
          </div>
          <button
            onClick={async () => {
              setAddingToOrdered(true);
              try {
                const items: Record<string, number> = {};
                for (const row of sizeSplit) {
                  if (row.qty > 0) items[row.sku] = row.qty;
                }
                await fetch("/api/stock-locations", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    addBatch: {
                      expectedDate: batchEta || undefined,
                      placedDate: new Date().toISOString().split("T")[0],
                      items,
                    },
                  }),
                });
                onViewProduct(selectedGroup.productId);
              } catch {
                // silently fail
              } finally {
                setAddingToOrdered(false);
              }
            }}
            disabled={addingToOrdered || totalQty <= 0 || !batchEta}
            title={!batchEta ? "Set the expected arrival date first" : undefined}
            className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addingToOrdered ? "Adding..." : `Add ${totalQty} as new order`}
          </button>
        </div>
      )}

      {selectedGroup && sizeSplit.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Enter an order quantity to see the size breakdown.
        </div>
      )}

      {!selectedProductId && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Select a product to get started.
        </div>
      )}
    </div>
  );
}
