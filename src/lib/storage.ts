import type {
  CachedProductData,
  CachedOrderData,
  SkuConfigStore,
  AlertHistoryStore,
  ProductConfigStore,
  StockLocationStore,
} from "./types";

const isNetlify = !!process.env.NETLIFY;

// --------------- Netlify Blobs backend ---------------

async function getBlobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("stockdaddy");
}

async function blobGet<T>(key: string, defaultValue: T): Promise<T> {
  const store = await getBlobStore();
  const raw = await store.get(key, { type: "text" });
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

async function blobSet<T>(key: string, data: T): Promise<void> {
  const store = await getBlobStore();
  await store.set(key, JSON.stringify(data));
}

// --------------- Local file backend ---------------

function getDataDir(): string {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function fileGet<T>(filename: string, defaultValue: T): T {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const filepath = path.join(getDataDir(), filename);
  try {
    const raw = fs.readFileSync(filepath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function fileSet<T>(filename: string, data: T): void {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const filepath = path.join(getDataDir(), filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}

// --------------- Unified async API ---------------

async function readData<T>(key: string, defaultValue: T): Promise<T> {
  if (isNetlify) return blobGet(key, defaultValue);
  return fileGet(key + ".json", defaultValue);
}

async function writeData<T>(key: string, data: T): Promise<void> {
  if (isNetlify) return blobSet(key, data);
  fileSet(key + ".json", data);
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
