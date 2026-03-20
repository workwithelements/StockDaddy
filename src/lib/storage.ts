import fs from "fs";
import path from "path";
import type {
  CachedProductData,
  CachedOrderData,
  SkuConfigStore,
  AlertHistoryStore,
  ProductConfigStore,
  StockLocationStore,
} from "./types";

function getDataDir(): string {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readJsonFile<T>(filename: string, defaultValue: T): T {
  const filepath = path.join(getDataDir(), filename);
  try {
    const raw = fs.readFileSync(filepath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function writeJsonFile<T>(filename: string, data: T): void {
  const filepath = path.join(getDataDir(), filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}

// Product cache
export function getProductCache(): CachedProductData {
  return readJsonFile("cache-products.json", {
    products: [],
    lastSyncedAt: "",
  });
}

export function setProductCache(data: CachedProductData): void {
  writeJsonFile("cache-products.json", data);
}

// Order cache
export function getOrderCache(): CachedOrderData {
  return readJsonFile("cache-orders.json", {
    dailySales: {},
    lastSyncedAt: "",
    oldestOrderDate: "",
    newestOrderDate: "",
  });
}

export function setOrderCache(data: CachedOrderData): void {
  writeJsonFile("cache-orders.json", data);
}

// SKU configs
export function getSkuConfigs(): SkuConfigStore {
  return readJsonFile("sku-config.json", { configs: {}, updatedAt: "" });
}

export function setSkuConfigs(data: SkuConfigStore): void {
  writeJsonFile("sku-config.json", data);
}

// Alert history
export function getAlertHistory(): AlertHistoryStore {
  return readJsonFile("alert-history.json", { alerts: {} });
}

export function setAlertHistory(data: AlertHistoryStore): void {
  writeJsonFile("alert-history.json", data);
}

// Product configs (product-level settings)
export function getProductConfigs(): ProductConfigStore {
  return readJsonFile("product-config.json", { configs: {}, updatedAt: "" });
}

export function setProductConfigs(data: ProductConfigStore): void {
  writeJsonFile("product-config.json", data);
}

// Stock locations
export function getStockLocations(): StockLocationStore {
  return readJsonFile("stock-locations.json", { locations: {}, updatedAt: "" });
}

export function setStockLocations(data: StockLocationStore): void {
  writeJsonFile("stock-locations.json", data);
}
