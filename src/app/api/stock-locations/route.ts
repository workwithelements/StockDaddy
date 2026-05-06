import { NextRequest, NextResponse } from "next/server";
import { getStockLocations, setStockLocations } from "@/lib/storage";
import type { StockLocationEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getStockLocations();
  return NextResponse.json(store);
}

/**
 * PUT /api/stock-locations
 * Body: { updates: Record<string, { ordered?: number; orderedExpectedDate?: string }> }
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const updates: Record<string, Partial<StockLocationEntry>> = body.updates;

  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "Missing updates" }, { status: 400 });
  }

  const store = await getStockLocations();

  for (const [sku, values] of Object.entries(updates)) {
    const existing: StockLocationEntry = store.locations[sku] || { ordered: 0 };
    store.locations[sku] = {
      ordered: values.ordered ?? existing.ordered,
      orderedExpectedDate:
        values.orderedExpectedDate !== undefined
          ? values.orderedExpectedDate || undefined
          : existing.orderedExpectedDate,
    };
  }

  store.updatedAt = new Date().toISOString();
  await setStockLocations(store);

  return NextResponse.json({ success: true });
}
