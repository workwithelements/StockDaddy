"use client";

import { useMemo, useState } from "react";
import type { ProductGroupRow } from "@/lib/types";

interface ScenarioPlannerProps {
  groups: ProductGroupRow[];
  onToggleAdvertised: (productId: string, productTitle: string, next: boolean) => void;
}

const PRESETS = [25, 50, 100, 200];

export default function ScenarioPlanner({
  groups,
  onToggleAdvertised,
}: ScenarioPlannerProps) {
  const [pct, setPct] = useState(50);

  const advertisedCount = groups.filter((g) => g.isAdvertised).length;
  const multiplier = 1 + pct / 100;

  const projections = useMemo(() => {
    const today = new Date();
    return groups.map((g) => {
      const applied = g.isAdvertised;
      const projectedRate = applied
        ? g.totalAvgDailyRate * multiplier
        : g.totalAvgDailyRate;

      const inventoryPosition = g.totalInventoryPosition;
      const projectedDaysLeft =
        projectedRate > 0 ? Math.floor(inventoryPosition / projectedRate) : null;

      const first = g.variants[0];
      const leadTime = (first?.leadTimeDays ?? 28) + (first?.deliveryTimeDays ?? 0);

      let reorderByDate: Date | null = null;
      let reorderStatus: "overdue" | "soon" | "ok" | "none" = "none";
      if (projectedDaysLeft !== null) {
        reorderByDate = new Date(today);
        reorderByDate.setDate(reorderByDate.getDate() + projectedDaysLeft - leadTime);
        const daysFromNow = projectedDaysLeft - leadTime;
        if (daysFromNow < 0) reorderStatus = "overdue";
        else if (daysFromNow <= 7) reorderStatus = "soon";
        else reorderStatus = "ok";
      }

      const safetyStock = g.variants.reduce((s, v) => s + v.safetyStock, 0);
      // Cover lead time + 30 days of post-arrival cover, minus what's already
      // in the pipeline (matches calculator's calculateSuggestedReorderQty).
      const COVER = 30;
      const projectedQty = Math.max(
        0,
        Math.ceil(projectedRate * (leadTime + COVER)) +
          safetyStock -
          g.totalPipelineStock
      );
      const projectedQtyMOQ = Math.max(projectedQty, g.moq);

      return {
        group: g,
        applied,
        projectedRate,
        projectedDaysLeft,
        reorderByDate,
        reorderStatus,
        projectedQty: projectedQtyMOQ,
        leadTime,
      };
    });
  }, [groups, multiplier]);

  // Sort: advertised+overdue → advertised+soon → advertised+ok → not-advertised
  const sorted = useMemo(() => {
    const order: Record<string, number> = { overdue: 0, soon: 1, ok: 2, none: 3 };
    return [...projections].sort((a, b) => {
      if (a.applied !== b.applied) return a.applied ? -1 : 1;
      const s = order[a.reorderStatus] - order[b.reorderStatus];
      if (s !== 0) return s;
      return (a.projectedDaysLeft ?? Infinity) - (b.projectedDaysLeft ?? Infinity);
    });
  }, [projections]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Scenario Planner
        </h2>
        <p className="text-sm text-gray-500">
          Project reorder timing if you increase ad spend. Mark which products
          are being advertised, then adjust the spend lift.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Spend Increase
            </label>
            <p className="text-xs text-gray-500">
              Assumes sales scale linearly with spend. Applies to{" "}
              <span className="font-medium text-indigo-600">
                {advertisedCount}
              </span>{" "}
              advertised product{advertisedCount === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={pct}
              onChange={(e) => setPct(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <span className="text-sm text-gray-500">%</span>
          </div>
        </div>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPct(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pct === p
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              +{p}%
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">
                  Advertised
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Product
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Stock
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Current Avg/Day
                </th>
                <th className="text-right px-4 py-3 font-medium text-indigo-600 bg-indigo-50/50">
                  Projected Avg/Day
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Days Left
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Reorder By
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Reorder Qty
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-12 text-gray-400"
                  >
                    No products yet. Sync from Shopify first.
                  </td>
                </tr>
              ) : (
                sorted.map(
                  ({
                    group: g,
                    applied,
                    projectedRate,
                    projectedDaysLeft,
                    reorderByDate,
                    reorderStatus,
                    projectedQty,
                  }) => (
                    <tr
                      key={g.productId}
                      className={`hover:bg-gray-50 ${
                        reorderStatus === "overdue" ? "bg-red-50/30" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={g.isAdvertised}
                          onChange={(e) =>
                            onToggleAdvertised(
                              g.productId,
                              g.productTitle,
                              e.target.checked
                            )
                          }
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {g.imageUrl ? (
                            <img
                              src={g.imageUrl}
                              alt=""
                              className="w-8 h-8 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />
                          )}
                          <div className="font-medium text-gray-900">
                            {g.productTitle}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {g.totalStock}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                        {g.totalAvgDailyRate.toFixed(1)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-medium ${
                          applied ? "text-indigo-700 bg-indigo-50/30" : "text-gray-400"
                        }`}
                      >
                        {projectedRate.toFixed(1)}
                        {applied && (
                          <span className="text-xs text-indigo-500 ml-1">
                            ×{(1 + pct / 100).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {projectedDaysLeft ?? "--"}
                      </td>
                      <td className="px-4 py-3">
                        {reorderByDate ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              reorderStatus === "overdue"
                                ? "bg-red-100 text-red-700"
                                : reorderStatus === "soon"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {reorderStatus === "overdue" && "ASAP · "}
                            {reorderByDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">No sales</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {projectedQty > 0 ? projectedQty : "--"}
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Reorder-by date = today + days until stockout − lead time. Quantity uses
        projected rate × lead time + safety stock, bumped to MOQ where set.
      </p>
    </div>
  );
}
