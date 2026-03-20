import { NextResponse } from "next/server";
import {
  getProductCache,
  getOrderCache,
  getSkuConfigs,
  getAlertHistory,
  getProductConfigs,
} from "@/lib/storage";
import { buildDashboardRows, buildProductGroups } from "@/lib/calculator";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = getProductCache();
  const orders = getOrderCache();
  const skuConfigs = getSkuConfigs();
  const alerts = getAlertHistory();
  const productConfigs = getProductConfigs();

  const rows = buildDashboardRows(
    products,
    orders,
    skuConfigs,
    alerts,
    productConfigs
  );
  const groups = buildProductGroups(rows, productConfigs);

  return NextResponse.json({
    rows,
    groups,
    lastSyncedAt: products.lastSyncedAt,
  });
}
