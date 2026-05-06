import { NextRequest, NextResponse } from "next/server";
import { getSkuConfigs, setSkuConfigs } from "@/lib/storage";
import type { SkuConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const configs = await getSkuConfigs();
  return NextResponse.json(configs);
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sku, safetyStock, safetyDays, sellThroughWindow } = body;

    if (!sku) {
      return NextResponse.json(
        { success: false, error: "SKU required" },
        { status: 400 }
      );
    }

    const store = await getSkuConfigs();

    const existing: SkuConfig = store.configs[sku] || {
      sku,
      safetyStock: 0,
      sellThroughWindow: 7 as const,
    };

    const updated: SkuConfig = {
      ...existing,
      ...(safetyStock !== undefined && { safetyStock }),
      ...(safetyDays !== undefined && { safetyDays }),
      ...(sellThroughWindow !== undefined && { sellThroughWindow }),
    };

    store.configs[sku] = updated;
    store.updatedAt = new Date().toISOString();
    await setSkuConfigs(store);

    return NextResponse.json({ success: true, config: updated });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
