"use client";

import { useState } from "react";
import type { SkuDashboardRow } from "@/lib/types";

interface EditConfigModalProps {
  row: SkuDashboardRow;
  onClose: () => void;
  onSave: () => void;
}

export default function EditConfigModal({
  row,
  onClose,
  onSave,
}: EditConfigModalProps) {
  const [safetyStock, setSafetyStock] = useState(row.safetyStock);
  const [safetyDays, setSafetyDays] = useState(row.safetyDays);
  const [window, setWindow] = useState(row.sellThroughWindow);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: row.sku,
          safetyStock,
          safetyDays,
          sellThroughWindow: window,
        }),
      });
      onSave();
      onClose();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Configure SKU
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {row.productTitle} &middot; {row.variantTitle}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Safety Days of Cover
            </label>
            <input
              type="number"
              min={0}
              value={safetyDays}
              onChange={(e) => setSafetyDays(parseInt(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Buffer expressed as days of stock — scales with demand. Default 7.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Extra Safety Stock (units)
            </label>
            <input
              type="number"
              min={0}
              value={safetyStock}
              onChange={(e) => setSafetyStock(parseInt(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Optional flat unit buffer added on top of safety days
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sell-Through Window
            </label>
            <select
              value={window}
              onChange={(e) =>
                setWindow(parseInt(e.target.value) as 7 | 14 | 30 | 60 | 90)
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Period used to calculate average daily sales
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Lead time and delivery time are now set at the product level in
          Settings.
        </p>

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
