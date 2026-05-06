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

type EditEntry = Partial<Pick<StockLocationEntry, "ordered" | "orderedExpectedDate">>;

export default function ProductStockPage({ productId, onBack }: Props) {
  const [product, setProduct] = useState<ProductData | null>(null);
  const [locations, setLocations] = useState<Record<string, StockLocationEntry>>({});
  const [editing, setEditing] = useState<Record<string, EditEntry>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
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
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function getLocation(sku: string): StockLocationEntry {
    return locations[sku] || { ordered: 0 };
  }

  function getOrdered(sku: string): number {
    const editVal = editing[sku]?.ordered;
    if (editVal !== undefined) return editVal;
    return getLocation(sku).ordered;
  }

  function getEta(sku: string): string {
    const editVal = editing[sku]?.orderedExpectedDate;
    if (editVal !== undefined) return editVal;
    return getLocation(sku).orderedExpectedDate ?? "";
  }

  function setOrdered(sku: string, value: string) {
    const num = Math.max(0, parseInt(value) || 0);
    setEditing((prev) => ({
      ...prev,
      [sku]: { ...prev[sku], ordered: num },
    }));
  }

  function setEta(sku: string, value: string) {
    setEditing((prev) => ({
      ...prev,
      [sku]: { ...prev[sku], orderedExpectedDate: value },
    }));
  }

  async function handleSave() {
    if (Object.keys(editing).length === 0) return;
    setSaving(true);

    const updates: Record<string, EditEntry> = {};
    for (const [sku, values] of Object.entries(editing)) {
      const current = getLocation(sku);
      updates[sku] = {
        ordered: values.ordered ?? current.ordered,
        orderedExpectedDate:
          values.orderedExpectedDate ?? current.orderedExpectedDate ?? "",
      };
    }

    try {
      await fetch("/api/stock-locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      setEditing({});
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

  if (!product) {
    return (
      <div className="text-center py-12 text-gray-400">Loading...</div>
    );
  }

  const hasEdits = Object.keys(editing).length > 0;

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
              <th className="text-left px-4 py-3 font-medium text-amber-600 bg-amber-50/50">
                Expected Arrival
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {product.variants.map((v) => {
              const ordered = getOrdered(v.sku);
              const eta = getEta(v.sku);
              return (
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
                      value={ordered}
                      onChange={(e) => setOrdered(v.sku, e.target.value)}
                      className="w-24 text-right tabular-nums border border-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-3 bg-amber-50/30">
                    <input
                      type="date"
                      value={eta}
                      onChange={(e) => setEta(v.sku, e.target.value)}
                      className="w-40 border border-gray-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-700">Total</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                {product.variants.reduce((s, v) => s + v.currentStock, 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-600 bg-amber-50/30">
                {product.variants.reduce((s, v) => s + getOrdered(v.sku), 0)}
              </td>
              <td className="px-4 py-3 bg-amber-50/30"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-2 text-xs text-gray-400">
        On-order stock counts toward your reorder calculation; current stock is
        what&apos;s sellable now. Set an expected arrival date so future logic can
        timeline incoming inventory.
      </div>

      {hasEdits && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setEditing({})}
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
