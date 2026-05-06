import type {
  CachedProductData,
  CachedOrderData,
  SkuConfigStore,
  AlertHistoryStore,
  ProductConfigStore,
  StockLocationStore,
} from "./types";

async function getBlobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("stockdaddy");
}

async function readData<T>(key: string, defaultValue: T): Promise<T> {
  const store = await getBlobStore();
  const raw = await store.get(key, { type: "text" });
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

async function writeData<T>(key: string, data: T): Promise<void> {
  const store = await getBlobStore();
  await store.set(key, JSON.stringify(data));
}

// Product cache
export async function getProductCache(): Promise<CachedProductData> {
  return readData("cache-products", { products: [], lastSyncedAt: "" });
}

export async function setProductCache(data: CachedProductData): Promise<void> {
  return writeData("cache-products", data);
}

// Order cache
export async function getOrderCache(): Promise<CachedOrderData> {
  return readData("cache-orders", {
    dailySales: {},
    lastSyncedAt: "",
    oldestOrderDate: "",
    newestOrderDate: "",
  });
}

export async function setOrderCache(data: CachedOrderData): Promise<void> {
  return writeData("cache-orders", data);
}

// SKU configs
export async function getSkuConfigs(): Promise<SkuConfigStore> {
  return readData("sku-config", { configs: {}, updatedAt: "" });
}

export async function setSkuConfigs(data: SkuConfigStore): Promise<void> {
  return writeData("sku-config", data);
}

// Alert history
export async function getAlertHistory(): Promise<AlertHistoryStore> {
  return readData("alert-history", { alerts: {} });
}

export async function setAlertHistory(data: AlertHistoryStore): Promise<void> {
  return writeData("alert-history", data);
}

// Product configs (product-level settings)
export async function getProductConfigs(): Promise<ProductConfigStore> {
  return readData("product-config", { configs: {}, updatedAt: "" });
}

export async function setProductConfigs(data: ProductConfigStore): Promise<void> {
  return writeData("product-config", data);
}

// Stock locations
export async function getStockLocations(): Promise<StockLocationStore> {
  return readData("stock-locations", { locations: {}, updatedAt: "" });
}

export async function setStockLocations(data: StockLocationStore): Promise<void> {
  return writeData("stock-locations", data);
}
