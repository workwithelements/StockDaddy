import { NextRequest, NextResponse } from "next/server";
import { syncFromShopify } from "@/lib/shopify";
import {
  getProductCache,
  getOrderCache,
  getSkuConfigs,
  getAlertHistory,
  setAlertHistory,
  getProductConfigs,
  getStockLocations,
} from "@/lib/storage";
import { buildDashboardRows, buildProductGroups } from "@/lib/calculator";
import { sendProductReorderAlert } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const shouldSync = request.nextUrl.searchParams.get("sync") === "true";

    if (shouldSync) {
      await syncFromShopify();
    }

    const products = await getProductCache();
    const orders = await getOrderCache();
    const configs = await getSkuConfigs();
    const alertHistory = await getAlertHistory();
    const productConfigs = await getProductConfigs();
    const stockLocations = await getStockLocations();

    const rows = buildDashboardRows(
      products,
      orders,
      configs,
      alertHistory,
      productConfigs,
      stockLocations
    );
    const groups = buildProductGroups(rows, productConfigs);

    const alertsSent: Array<{
      productId: string;
      productTitle: string;
      skus: string[];
    }> = [];

    for (const group of groups) {
      // Find variants that need reorder AND haven't been alerted on (or have
      // been restocked >=20% since the last alert).
      const triggering = group.variants.filter((v) => {
        if (!v.reorderNeeded) return false;
        const existing = alertHistory.alerts[v.sku];
        if (existing && !existing.dismissed) {
          if (v.currentStock <= existing.inventoryAtAlert * 1.2) return false;
        }
        return true;
      });

      if (triggering.length === 0) continue;

      const sent = await sendProductReorderAlert(group);
      if (!sent) continue;

      // Record an alert for every variant we just included so dedup is honest.
      const now = new Date().toISOString();
      for (const v of triggering) {
        alertHistory.alerts[v.sku] = {
          sku: v.sku,
          alertedAt: now,
          dismissed: false,
          inventoryAtAlert: v.currentStock,
        };
      }
      alertsSent.push({
        productId: group.productId,
        productTitle: group.productTitle,
        skus: triggering.map((v) => v.sku),
      });
    }

    await setAlertHistory(alertHistory);

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      totalSkus: rows.length,
      reorderNeeded: rows.filter((r) => r.reorderNeeded).length,
      alertsSent: alertsSent.length,
      alerts: alertsSent,
    });
  } catch (err) {
    console.error("Check failed:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
