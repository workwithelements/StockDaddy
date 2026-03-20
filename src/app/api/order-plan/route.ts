import { NextRequest, NextResponse } from "next/server";
import { getProductCache, getOrderCache } from "@/lib/storage";
import { calculateAvgDailySellRate } from "@/lib/calculator";

export const dynamic = "force-dynamic";

/**
 * GET /api/order-plan?window=30
 * Returns product groups with sell-rate data for the order planner.
 * Accepts ?window=7 or ?window=30 (default 30).
 */
export async function GET(request: NextRequest) {
  const windowParam = request.nextUrl.searchParams.get("window");
  const windowDays = windowParam === "7" ? 7 : windowParam === "14" ? 14 : 30;

  const products = getProductCache();
  const orders = getOrderCache();

  const plannerGroups = products.products.map((product) => ({
    productId: String(product.id),
    productTitle: product.title,
    imageUrl: product.image?.src,
    variants: product.variants.map((v) => {
      const sku = v.sku || `_auto_${product.id}_${v.id}`;
      const sales = orders.dailySales[sku] || [];
      const avgDailySellRate = calculateAvgDailySellRate(sales, windowDays);
      return {
        variantTitle: v.title,
        sku,
        currentStock: v.inventory_quantity,
        avgDailySellRate,
      };
    }),
  }));

  return NextResponse.json({ groups: plannerGroups, windowDays });
}
