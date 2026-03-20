"use client";

import { useState, useMemo } from "react";
import type { ProductGroupRow, StockStatus } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import FavouriteButton from "./FavouriteButton";
import EditConfigModal from "./EditConfigModal";
import type { SkuDashboardRow } from "@/lib/types";

interface DashboardTableProps {
  groups: ProductGroupRow[];
  onRefresh: () => void;
  onDismissAlert: (sku: string) => void;
  onToggleFavourite: (productId: string) => void;
  onViewProduct: (productId: string) => void;
}

type FilterTab = "all" | "red" | "yellow" | "green";

export default function DashboardTable({
  groups,
  onRefresh,
  onDismissAlert,
  onToggleFavourite,
  onViewProduct,
}: DashboardTableProps) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set()
  );
  const [editingRow, setEditingRow] = useState<SkuDashboardRow | null>(null);

  const counts = useMemo(() => {
    return {
      all: groups.length,
      red: groups.filter((g) => g.worstStatus === "red").length,
      yellow: groups.filter((g) => g.worstStatus === "yellow").length,
      green: groups.filter((g) => g.worstStatus === "green").length,
    };
  }, [groups]);

  const filteredGroups = useMemo(() => {
    let result = groups;

    // Filter by status tab
    if (filter !== "all") {
      result = result.filter((g) => g.worstStatus === filter);
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((g) => {
        // Match on product title
        if (g.productTitle.toLowerCase().includes(q)) return true;
        // Match on any variant
        return g.variants.some(
          (v) =>
            v.variantTitle.toLowerCase().includes(q) ||
            v.sku.toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [groups, filter, search]);

  function toggleExpand(productId: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  const tabs: Array<{ key: FilterTab; label: string; color: string }> = [
    { key: "all", label: "All", color: "bg-gray-100 text-gray-700" },
    { key: "red", label: "Reorder", color: "bg-red-100 text-red-700" },
    {
      key: "yellow",
      label: "Low Stock",
      color: "bg-yellow-100 text-yellow-700",
    },
    { key: "green", label: "Healthy", color: "bg-green-100 text-green-700" },
  ];

  const anyReorder = filteredGroups.some((g) =>
    g.variants.some((v) => v.reorderNeeded)
  );

  return (
    <div>
      {/* Filter tabs and search */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.key
                  ? tab.color + " ring-2 ring-offset-1 ring-gray-300"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {tab.label} ({counts[tab.key]})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-8"></th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Product
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Stock
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Avg/Day
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Days Left
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">
                  Status
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Order Qty
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 w-16">
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    {groups.length === 0
                      ? 'No data yet. Click "Sync from Shopify" to get started.'
                      : "No matching products found."}
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group) => {
                  const isExpanded = expandedProducts.has(group.productId);
                  const hasMultipleVariants = group.variants.length > 1;
                  const groupHasReorder = group.variants.some(
                    (v) => v.reorderNeeded
                  );

                  return (
                    <ProductGroup
                      key={group.productId}
                      group={group}
                      isExpanded={isExpanded}
                      hasMultipleVariants={hasMultipleVariants}
                      groupHasReorder={groupHasReorder}
                      onToggleExpand={() => toggleExpand(group.productId)}
                      onToggleFavourite={() =>
                        onToggleFavourite(group.productId)
                      }
                      onEditRow={setEditingRow}
                      onDismissAlert={onDismissAlert}
                      onViewProduct={() => onViewProduct(group.productId)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-3 text-sm text-gray-500 text-center">
        {filteredGroups.length} product
        {filteredGroups.length !== 1 ? "s" : ""} shown &middot; {counts.red}{" "}
        need reorder &middot; {counts.yellow} approaching
      </div>

      {/* Edit modal */}
      {editingRow && (
        <EditConfigModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSave={onRefresh}
        />
      )}
    </div>
  );
}

// --- Product group row + expandable variants ---

interface ProductGroupProps {
  group: ProductGroupRow;
  isExpanded: boolean;
  hasMultipleVariants: boolean;
  groupHasReorder: boolean;
  onToggleExpand: () => void;
  onToggleFavourite: () => void;
  onEditRow: (row: SkuDashboardRow) => void;
  onDismissAlert: (sku: string) => void;
  onViewProduct: () => void;
}

function ProductGroup({
  group,
  isExpanded,
  hasMultipleVariants,
  groupHasReorder,
  onToggleExpand,
  onToggleFavourite,
  onEditRow,
  onDismissAlert,
  onViewProduct,
}: ProductGroupProps) {
  return (
    <>
      {/* Product row */}
      <tr
        className={`hover:bg-gray-50 ${
          group.worstStatus === "red" ? "bg-red-50/30" : ""
        } ${hasMultipleVariants ? "cursor-pointer" : ""}`}
        onClick={hasMultipleVariants ? onToggleExpand : undefined}
      >
        <td className="px-4 py-3">
          <FavouriteButton
            isFavourite={group.isFavourite}
            onClick={onToggleFavourite}
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            {group.imageUrl ? (
              <img
                src={group.imageUrl}
                alt=""
                className="w-8 h-8 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />
            )}
            <div>
              <button
                onClick={(e) => { e.stopPropagation(); onViewProduct(); }}
                className="font-medium text-gray-900 hover:text-indigo-600 hover:underline text-left"
              >
                {group.productTitle}
              </button>
              <div className="text-xs text-gray-500">
                {group.variants.length} variant
                {group.variants.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-medium">
          {group.totalStock}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {group.totalAvgDailyRate.toFixed(1)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {group.minDaysUntilStockout !== null
            ? group.minDaysUntilStockout
            : "--"}
        </td>
        <td className="px-4 py-3 text-center">
          <StatusBadge status={group.worstStatus} />
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          <div className="font-medium">
            {group.totalSuggestedReorderQty > 0
              ? group.totalSuggestedReorderQty
              : "--"}
          </div>
          {group.moq > 0 && (
            <div className="text-xs text-gray-400">
              MOQ {group.moq}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          {hasMultipleVariants && (
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform mx-auto ${
                isExpanded ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
        </td>
      </tr>

      {/* Expanded variant rows */}
      {isExpanded &&
        group.variants.map((variant, idx) => (
          <tr
            key={variant.sku}
            className={`bg-gray-50/50 ${
              variant.reorderStatus === "red" ? "bg-red-50/20" : ""
            }`}
          >
            <td className="px-4 py-2"></td>
            <td className="px-4 py-2">
              <div className="flex items-center gap-2 pl-11">
                <span className="text-gray-400 text-xs">
                  {idx === group.variants.length - 1 ? "└" : "├"}
                </span>
                <div>
                  <span className="text-sm text-gray-700">
                    {variant.variantTitle}
                  </span>
                  <span className="text-xs text-gray-400 ml-2 font-mono">
                    {variant.sku}
                  </span>
                </div>
              </div>
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-gray-600">
              {variant.currentStock}
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-gray-600">
              {variant.avgDailySellRate.toFixed(1)}
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-gray-600">
              {variant.daysUntilStockout !== null
                ? variant.daysUntilStockout
                : "--"}
            </td>
            <td className="px-4 py-2 text-center">
              <StatusBadge status={variant.reorderStatus} />
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-gray-600">
              {variant.moqSuggestedQty > 0 ? variant.moqSuggestedQty : "--"}
            </td>
            <td className="px-4 py-2 text-center">
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => onEditRow(variant)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  title="Configure SKU"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
                {variant.hasActiveAlert && (
                  <button
                    onClick={() => onDismissAlert(variant.sku)}
                    className="p-1 text-amber-500 hover:text-amber-700 rounded"
                    title="Dismiss alert"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                    </svg>
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}
