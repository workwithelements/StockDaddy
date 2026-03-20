"use client";

import { useState, useMemo } from "react";
import type { ProductGroupRow, ProductConfig } from "@/lib/types";

interface SettingsPanelProps {
  groups: ProductGroupRow[];
  onSave: (config: Partial<ProductConfig> & { productId: string }) => void;
}

interface EditState {
  leadTimeDays: number;
  deliveryTimeDays: number;
  moq: number;
  scaler: number;
}

export default function SettingsPanel({ groups, onSave }: SettingsPanelProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({
    leadTimeDays: 28,
    deliveryTimeDays: 0,
    moq: 0,
    scaler: 1,
  });
  const [saving, setSaving] = useState(false);

  const filteredGroups = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.productTitle.toLowerCase().includes(q));
  }, [groups, search]);

  function startEditing(group: ProductGroupRow) {
    setEditingId(group.productId);
    setEditState({
      leadTimeDays:
        group.variants[0]?.leadTimeDays ?? 28,
      deliveryTimeDays:
        group.variants[0]?.deliveryTimeDays ?? 0,
      moq: group.moq,
      scaler: group.scaler,
    });
  }

  async function handleSave(productId: string, productTitle: string) {
    setSaving(true);
    await onSave({
      productId,
      productTitle,
      leadTimeDays: editState.leadTimeDays,
      deliveryTimeDays: editState.deliveryTimeDays,
      moq: editState.moq,
      scaler: editState.scaler,
    });
    setSaving(false);
    setEditingId(null);
  }

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="space-y-3">
        {filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No products found.
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isEditing = editingId === group.productId;
            return (
              <div
                key={group.productId}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {group.imageUrl ? (
                      <img
                        src={group.imageUrl}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                          />
                        </svg>
                      </div>
                    )}
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {group.productTitle}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {group.variants.length} size
                        {group.variants.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => startEditing(group)}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Restock Time (days)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editState.leadTimeDays}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              leadTimeDays: parseInt(e.target.value) || 0,
                            }))
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Delivery (days)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editState.deliveryTimeDays}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              deliveryTimeDays: parseInt(e.target.value) || 0,
                            }))
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Min Order Qty (MOQ)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editState.moq}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              moq: parseInt(e.target.value) || 0,
                            }))
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Demand Scaler
                        </label>
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={editState.scaler}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              scaler: parseFloat(e.target.value) || 1,
                            }))
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">
                          1.0 = normal, 1.5 = 50% more
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() =>
                          handleSave(group.productId, group.productTitle)
                        }
                        disabled={saving}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Restock:</span>{" "}
                      <span className="font-medium">
                        {group.variants[0]?.leadTimeDays ?? 28}d
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Delivery:</span>{" "}
                      <span className="font-medium">
                        {group.variants[0]?.deliveryTimeDays ?? 0}d
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">MOQ:</span>{" "}
                      <span className="font-medium">
                        {group.moq || "--"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Scaler:</span>{" "}
                      <span className="font-medium">{group.scaler}x</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
