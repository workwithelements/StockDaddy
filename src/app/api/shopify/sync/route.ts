import { NextResponse } from "next/server";
import { syncFromShopify } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { products, orders } = await syncFromShopify();

    const variantCount = products.products.reduce(
      (sum, p) => sum + p.variants.length,
      0
    );
    const skuCount = products.products.reduce(
      (sum, p) => sum + p.variants.filter((v) => v.sku).length,
      0
    );

    return NextResponse.json({
      success: true,
      productCount: products.products.length,
      variantCount,
      skuCount,
      orderSkus: Object.keys(orders.dailySales).length,
      syncedAt: products.lastSyncedAt,
    });
  } catch (err) {
    console.error("Sync failed:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
