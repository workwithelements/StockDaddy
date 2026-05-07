"use client";

import { useState, useEffect, useCallback } from "react";
import type { StockLocationEntry } from "@/lib/types";

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

export default function ProductStockPage({ productId, onBack }: Props) {
  const [product, setProduct] = useState<ProductData | null>(null);
  const [locations, setLocations] = useState<Record<string, StockLocationEntry>>({});
  const [loading, setLoading] = useState(true);
  // Per-SKU draft of the ordered qty. Empty means "no edits".
  const [editedQtys, setEditedQtys] = useState<Record<string, number>>({});
  // One date input applied to every size on save. Initialised from the first
  // variant that has one stored.
  const [productEta, setProductEta] = useState<string>("");
  const [etaEdited, setEtaEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    const locs: Record<string, StockLocationEntry> = locData.locations || {};
    setLocations(locs);

    // Derive a product-wide ETA from any variant that has one stored.
    if (group) {
      const firstDate = group.variants
        .map((v: ProductVariant) => locs[v.sku]?.orderedExpectedDate)
        .find((d: string | undefined) => d && d.length > 0);
      setProductEta(firstDate || "");
      setEtaEdited(false);
    }
    setEditedQtys({});
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function getOrdered(sku: string): number {
    const editVal = editedQtys[sku];
    if (editVal !== undefined) return editVal;
    return locations[sku]?.ordered ?? 0;
  }

  function setOrdered(sku: string, value: string) {
    const num = Math.max(0, parseInt(value) || 0);
    setEditedQtys((prev) => ({ ...prev, [sku]: num }));
  }

  async function handleSave() {
    if (!product) return;
    setSaving(true);

    const updates: Record<
      string,
      { ordered: number; orderedExpectedDate?: string }
    > = {};
    for (const v of product.variants) {
      updates[v.sku] = {
        ordered: getOrdered(v.sku),
        orderedExpectedDate: productEta || undefined,
      };
    }

    try {
      await fetch("/api/stock-locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      await fetchData();
      showToast("Stock locations saved");
    } catch {
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
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
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
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

  const hasEdits =
    Object.keys(editedQtys).length > 0 || etaEdited;
  const totalOrdered = product.variants.reduce(
    (s, v) => s + getOrdered(v.sku),
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
          <img
            src={product.imageUrl}
            alt=""
            className="w-12 h-12 rounded-lg object-cover"
          />
        )}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {product.productTitle}
          </h2>
          <p className="text-sm text-gray-500">
            {product.variants.length} variants &middot; Stock locations
          </p>
        </div>
      </div>

      {/* One ETA input applied to all sizes */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Expected Arrival (all sizes)
          </label>
          <p className="text-xs text-gray-500">
            Single delivery date for the in-progress order. Updates every
            variant on save.
          </p>
        </div>
        <input
          type="date"
          value={productEta}
          onChange={(e) => {
            setProductEta(e.target.value);
            setEtaEdited(true);
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Variant
              </th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">
                Current Stock
              </th>
              <th className="text-right px-4 py-3 font-medium text-amber-600 bg-amber-50/50">
                On Order
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {product.variants.map((v) => (
              <tr key={v.sku} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {v.variantTitle}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                  {v.currentStock}
                </td>
                <td className="px-4 py-3 text-right bg-amber-50/30">
                  <input
                    type="number"
                    min={0}
                    value={getOrdered(v.sku)}
                    onChange={(e) => setOrdered(v.sku, e.target.value)}
                    className="w-24 text-right tabular-nums border border-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-700">Total</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                {product.variants.reduce((s, v) => s + v.currentStock, 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-600 bg-amber-50/30">
                {totalOrdered}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-2 text-xs text-gray-400">
        On-order stock counts toward your reorder calculation. When the order
        arrives at the warehouse, the next sync will reduce these values
        automatically based on Shopify&apos;s inventory delta.
      </div>

      {hasEdits && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              setEditedQtys({});
              setEtaEdited(false);
              fetchData();
            }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 mr-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
