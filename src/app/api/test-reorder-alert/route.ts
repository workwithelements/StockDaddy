import { NextResponse } from "next/server";
import { sendProductReorderAlert } from "@/lib/telegram";
import type { ProductGroupRow, SkuDashboardRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function makeVariant(
  variantTitle: string,
  sku: string,
  currentStock: number,
  pipelineStock: number,
  avgRate: number,
  moqQty: number,
  orderedExpectedDate?: string
): SkuDashboardRow {
  const inventoryPosition = currentStock + pipelineStock;
  const daysUntilStockout =
    avgRate > 0 ? Math.floor(inventoryPosition / avgRate) : null;
  return {
    productId: "test-product",
    productTitle: "Sample Hoodie",
    variantTitle,
    sku,
    currentStock,
    pipelineStock,
    orderedExpectedDate,
    inventoryPosition,
    avgDailySellRate: avgRate,
    daysUntilStockout,
    hasGap: false,
    undatedOnOrder: 0,
    recommendation: "reorder",
    reorderStatus: "red",
    reorderNeeded: true,
    reorderPoint: Math.ceil(avgRate * 28) + 14,
    leadTimeDays: 28,
    deliveryTimeDays: 0,
    safetyStock: 0,
    safetyDays: 7,
    effectiveSafetyStock: Math.ceil(avgRate * 7),
    suggestedReorderQty: moqQty,
    moqSuggestedQty: moqQty,
    sellThroughWindow: 7,
    hasActiveAlert: false,
  };
}

export async function GET() {
  const variants = [
    makeVariant("Small", "HOODIE-S", 4, 0, 1.4, 30),
    makeVariant("Medium", "HOODIE-M", 8, 50, 2.8, 40, "2026-06-03"),
    makeVariant("Large", "HOODIE-L", 12, 0, 1.9, 30),
  ];

  const fakeGroup: ProductGroupRow = {
    productId: "test-product",
    productTitle: "Sample Hoodie",
    isFavourite: false,
    isAdvertised: true,
    totalStock: variants.reduce((s, v) => s + v.currentStock, 0),
    totalPipelineStock: variants.reduce((s, v) => s + v.pipelineStock, 0),
    totalInventoryPosition: variants.reduce((s, v) => s + v.inventoryPosition, 0),
    totalAvgDailyRate: variants.reduce((s, v) => s + v.avgDailySellRate, 0),
    worstStatus: "red",
    minDaysUntilStockout: Math.min(
      ...variants.map((v) => v.daysUntilStockout ?? Infinity)
    ),
    moq: 100,
    scaler: 1,
    totalSuggestedReorderQty: variants.reduce((s, v) => s + v.moqSuggestedQty, 0),
    variants,
  };

  const ok = await sendProductReorderAlert(fakeGroup);
  return NextResponse.json(
    { success: ok, ...(ok ? {} : { reason: "see Netlify function logs" }) },
    { status: ok ? 200 : 500 }
  );
}
