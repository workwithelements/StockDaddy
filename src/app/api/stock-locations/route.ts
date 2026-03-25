import { NextRequest, NextResponse } from "next/server";
import { getStockLocations, setStockLocations } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/stock-locations?productId=123
 * Returns all stock location entries, optionally filtered by product SKU prefix.
 */
export async function GET() {
  const store = await getStockLocations();
  return NextResponse.json(store);
}

/**
 * PUT /api/stock-locations
 * Update stock locations for one or more SKUs.
 * Body: { updates: Record<string, { uk3pl?: number; china?: number; ordered?: number }> }
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const updates: Record<string, { uk3pl?: number; china?: number; ordered?: number }> =
    body.updates;

  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "Missing updates" }, { status: 400 });
  }

  const store = await getStockLocations();

  for (const [sku, values] of Object.entries(updates)) {
    const existing = store.locations[sku] || { uk3pl: 0, china: 0, ordered: 0 };
    store.locations[sku] = {
      uk3pl: values.uk3pl ?? existing.uk3pl,
      china: values.china ?? existing.china,
      ordered: values.ordered ?? existing.ordered,
    };
  }

  store.updatedAt = new Date().toISOString();
  await setStockLocations(store);

  return NextResponse.json({ success: true });
}
