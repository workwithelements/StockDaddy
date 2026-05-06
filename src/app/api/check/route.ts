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
import { buildDashboardRows } from "@/lib/calculator";
import { sendSlackAlert } from "@/lib/slack";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const shouldSync = request.nextUrl.searchParams.get("sync") === "true";

    // Optionally sync fresh data first
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

    const alertsSent: Array<{
      sku: string;
      productTitle: string;
      daysUntilStockout: number | null;
    }> = [];

    for (const row of rows) {
      if (!row.reorderNeeded) continue;

      const existing = alertHistory.alerts[row.sku];

      // Check if already alerted and not restocked
      if (existing && !existing.dismissed) {
        // Has stock been replenished since last alert? (20% increase threshold)
        if (row.currentStock <= existing.inventoryAtAlert * 1.2) {
          continue; // Skip - already alerted, not restocked
        }
      }

      // Send Slack alert
      const sent = await sendSlackAlert(row);

      if (sent) {
        alertHistory.alerts[row.sku] = {
          sku: row.sku,
          alertedAt: new Date().toISOString(),
          dismissed: false,
          inventoryAtAlert: row.currentStock,
        };

        alertsSent.push({
          sku: row.sku,
          productTitle: row.productTitle,
          daysUntilStockout: row.daysUntilStockout,
        });
      }
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
