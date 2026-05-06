import { NextRequest, NextResponse } from "next/server";
import { getProductConfigs, setProductConfigs, getProductCache } from "@/lib/storage";
import type { ProductConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const configs = await getProductConfigs();
  return NextResponse.json(configs);
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      productId,
      productTitle,
      leadTimeDays,
      deliveryTimeDays,
      moq,
      scaler,
      isFavourite,
      isAdvertised,
    } = body;

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "productId required" },
        { status: 400 }
      );
    }

    const store = await getProductConfigs();

    // Get product title from cache if not provided
    let title = productTitle;
    if (!title) {
      const cache = await getProductCache();
      const product = cache.products.find((p) => String(p.id) === productId);
      title = product?.title ?? "Unknown Product";
    }

    const existing: ProductConfig = store.configs[productId] || {
      productId,
      productTitle: title,
      leadTimeDays: 28,
      deliveryTimeDays: 0,
      moq: 100,
      scaler: 1,
      isFavourite: false,
    };

    const updated: ProductConfig = {
      ...existing,
      productTitle: title,
      ...(leadTimeDays !== undefined && { leadTimeDays }),
      ...(deliveryTimeDays !== undefined && { deliveryTimeDays }),
      ...(moq !== undefined && { moq }),
      ...(scaler !== undefined && { scaler }),
      ...(isFavourite !== undefined && { isFavourite }),
      ...(isAdvertised !== undefined && { isAdvertised }),
    };

    store.configs[productId] = updated;
    store.updatedAt = new Date().toISOString();
    await setProductConfigs(store);

    return NextResponse.json({ success: true, config: updated });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
