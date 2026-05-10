import type { ShopifyProduct, CachedProductData, CachedOrderData, DailySalesEntry } from "./types";
import {
  setProductCache,
  setOrderCache,
  getProductCache,
  getStockLocations,
  setStockLocations,
} from "./storage";
import { deductFromBatches, normalizeEntry } from "./orderedBatches";

const API_VERSION = "2024-01";

function getStoreUrl(endpoint: string): string {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  return `https://${domain}/admin/api/${API_VERSION}/${endpoint}.json`;
}

function getHeaders(): Record<string, string> {
  return {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN!,
    "Content-Type": "application/json",
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLinkHeader(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

async function shopifyFetch<T>(url: string): Promise<{ data: T; nextUrl: string | null }> {
  const res = await fetch(url, { headers: getHeaders() });

  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get("Retry-After") || "2");
    await delay(retryAfter * 1000);
    return shopifyFetch<T>(url);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as T;
  const nextUrl = parseLinkHeader(res.headers.get("link"));
  return { data, nextUrl };
}

export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let url = getStoreUrl("products") + "?status=active&limit=250";

  while (url) {
    const { data, nextUrl } = await shopifyFetch<{ products: ShopifyProduct[] }>(url);
    products.push(...data.products);
    url = nextUrl!;
    if (nextUrl) await delay(500);
  }

  return products;
}

export async function fetchInventoryLevels(
  inventoryItemIds: number[]
): Promise<Record<number, number>> {
  const levels: Record<number, number> = {};

  // Batch in groups of 50
  for (let i = 0; i < inventoryItemIds.length; i += 50) {
    const batch = inventoryItemIds.slice(i, i + 50);
    const ids = batch.join(",");
    const url = getStoreUrl("inventory_levels") + `?inventory_item_ids=${ids}&limit=250`;

    const { data } = await shopifyFetch<{
      inventory_levels: Array<{ inventory_item_id: number; available: number | null }>;
    }>(url);

    for (const level of data.inventory_levels) {
      const current = levels[level.inventory_item_id] || 0;
      levels[level.inventory_item_id] = current + (level.available ?? 0);
    }

    if (i + 50 < inventoryItemIds.length) await delay(500);
  }

  return levels;
}

interface ShopifyOrder {
  id: number;
  created_at: string;
  financial_status: string;
  line_items: Array<{
    sku: string;
    variant_id: number;
    product_id: number;
    quantity: number;
  }>;
}

export async function fetchOrders(sinceDate: string): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = [];
  let url =
    getStoreUrl("orders") +
    `?status=any&created_at_min=${sinceDate}&limit=250&fields=id,created_at,financial_status,line_items&order=created_at+desc`;

  while (url) {
    const { data, nextUrl } = await shopifyFetch<{ orders: ShopifyOrder[] }>(url);
    orders.push(...data.orders);
    url = nextUrl!;
    if (nextUrl) await delay(500);
  }

  return orders;
}

function aggregateOrdersToDaily(
  orders: ShopifyOrder[],
  variantSkuMap: Map<number, string>
): Record<string, DailySalesEntry[]> {
  const dailySales: Record<string, Record<string, number>> = {};

  for (const order of orders) {
    // Skip refunded orders
    if (order.financial_status === "refunded") continue;

    const date = order.created_at.split("T")[0];

    for (const item of order.line_items) {
      // Use real SKU, or fall back to auto-generated SKU from variant_id
      const sku = item.sku || variantSkuMap.get(item.variant_id);
      if (!sku) continue;

      if (!dailySales[sku]) dailySales[sku] = {};
      dailySales[sku][date] = (dailySales[sku][date] || 0) + item.quantity;
    }
  }

  // Convert to array format
  const result: Record<string, DailySalesEntry[]> = {};
  for (const [sku, dateMap] of Object.entries(dailySales)) {
    result[sku] = Object.entries(dateMap)
      .map(([date, quantity]) => ({ date, quantity }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  return result;
}

export async function syncFromShopify(): Promise<{
  products: CachedProductData;
  orders: CachedOrderData;
}> {
  // 0. Capture pre-sync inventory by SKU so we can detect restock arrivals
  //    after the new data lands.
  const previousCache = await getProductCache();
  const prevInventoryBySku = new Map<string, number>();
  for (const p of previousCache.products) {
    for (const v of p.variants) {
      const sku = v.sku || `_auto_${p.id}_${v.id}`;
      prevInventoryBySku.set(sku, v.inventory_quantity);
    }
  }
  const lastSyncDate = previousCache.lastSyncedAt
    ? previousCache.lastSyncedAt.split("T")[0]
    : "";

  // 1. Fetch all products
  const products = await fetchAllProducts();

  // 2. Get all inventory item IDs
  const inventoryItemIds: number[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.inventory_item_id) {
        inventoryItemIds.push(variant.inventory_item_id);
      }
    }
  }

  // 3. Fetch inventory levels
  const levels = await fetchInventoryLevels(inventoryItemIds);

  // 4. Update variant quantities
  for (const product of products) {
    for (const variant of product.variants) {
      if (levels[variant.inventory_item_id] !== undefined) {
        variant.inventory_quantity = levels[variant.inventory_item_id];
      }
    }
  }

  // 5. Build variant_id → auto_sku map for variants with empty SKUs
  const variantSkuMap = new Map<number, string>();
  for (const product of products) {
    for (const variant of product.variants) {
      if (!variant.sku) {
        variantSkuMap.set(variant.id, `_auto_${product.id}_${variant.id}`);
      }
    }
  }

  // 6. Fetch orders from last 90 days
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 90);
  const orders = await fetchOrders(sinceDate.toISOString());

  // 7. Aggregate into daily sales
  const dailySales = aggregateOrdersToDaily(orders, variantSkuMap);

  // 8. Reconcile incoming orders against actual stock arrivals.
  //    For each variant, if Shopify inventory went up (after accounting for
  //    sales since the last sync), assume the increase is a restock landing
  //    and decrement the SKU's `ordered` value by that amount.
  const stockLocations = await getStockLocations();
  let reconcileMade = false;
  if (lastSyncDate) {
    for (const product of products) {
      for (const variant of product.variants) {
        const sku = variant.sku || `_auto_${product.id}_${variant.id}`;
        const prevInv = prevInventoryBySku.get(sku);
        if (prevInv === undefined) continue;
        const newInv = variant.inventory_quantity;

        const sinceSales = (dailySales[sku] ?? [])
          .filter((e) => e.date > lastSyncDate)
          .reduce((s, e) => s + e.quantity, 0);

        // restocks = newInv - prevInv + sales_in_window
        // (rearranging newInv = prevInv - sales + restocks)
        const restocks = newInv - prevInv + sinceSales;
        if (restocks <= 0) continue;

        const loc = normalizeEntry(stockLocations.locations[sku]);
        const { batches, deducted } = deductFromBatches(loc, restocks);
        if (deducted <= 0) continue;

        stockLocations.locations[sku] = {
          orderedBatches: batches,
        };
        reconcileMade = true;
      }
    }
  }
  if (reconcileMade) {
    stockLocations.updatedAt = new Date().toISOString();
    await setStockLocations(stockLocations);
  }

  const now = new Date().toISOString();

  const productData: CachedProductData = {
    products,
    lastSyncedAt: now,
  };

  const orderData: CachedOrderData = {
    dailySales,
    lastSyncedAt: now,
    oldestOrderDate: sinceDate.toISOString().split("T")[0],
    newestOrderDate: new Date().toISOString().split("T")[0],
  };

  await setProductCache(productData);
  await setOrderCache(orderData);

  return { products: productData, orders: orderData };
}
