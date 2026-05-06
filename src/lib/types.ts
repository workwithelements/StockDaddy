// === Shopify-sourced data ===

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string;
  inventory_item_id: number;
  inventory_quantity: number;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
  variants: ShopifyVariant[];
  image?: { src: string };
}

export interface CachedProductData {
  products: ShopifyProduct[];
  lastSyncedAt: string;
}

export interface DailySalesEntry {
  date: string;
  quantity: number;
}

export interface CachedOrderData {
  dailySales: Record<string, DailySalesEntry[]>;
  lastSyncedAt: string;
  oldestOrderDate: string;
  newestOrderDate: string;
}

// === SKU Configuration ===

export interface SkuConfig {
  sku: string;
  leadTimeDays?: number;
  deliveryTimeDays?: number;
  safetyStock: number;
  sellThroughWindow: 7 | 14 | 30 | 60 | 90;
}

export interface SkuConfigStore {
  configs: Record<string, SkuConfig>;
  updatedAt: string;
}

// === Product Configuration (product-level) ===

export interface ProductConfig {
  productId: string;
  productTitle: string;
  leadTimeDays: number;
  deliveryTimeDays: number;
  moq: number;
  scaler: number;
  isFavourite: boolean;
  isAdvertised?: boolean;
}

export interface ProductConfigStore {
  configs: Record<string, ProductConfig>;
  updatedAt: string;
}

// === Alert History ===

export interface AlertRecord {
  sku: string;
  alertedAt: string;
  dismissed: boolean;
  dismissedAt?: string;
  inventoryAtAlert: number;
}

export interface AlertHistoryStore {
  alerts: Record<string, AlertRecord>;
}

// === Stock Locations ===

export interface StockLocationEntry {
  uk3pl: number;
  china: number;
  ordered: number;
}

export interface StockLocationStore {
  /** keyed by SKU (or auto-SKU for variants with empty Shopify SKUs) */
  locations: Record<string, StockLocationEntry>;
  updatedAt: string;
}

// === Dashboard View Model ===

export type StockStatus = "green" | "yellow" | "red";

export interface SkuDashboardRow {
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  imageUrl?: string;
  currentStock: number;
  pipelineStock: number;
  inventoryPosition: number;
  avgDailySellRate: number;
  daysUntilStockout: number | null;
  reorderStatus: StockStatus;
  reorderNeeded: boolean;
  leadTimeDays: number;
  deliveryTimeDays: number;
  safetyStock: number;
  suggestedReorderQty: number;
  moqSuggestedQty: number;
  sellThroughWindow: number;
  hasActiveAlert: boolean;
}

// === Product Group View Model ===

export interface ProductGroupRow {
  productId: string;
  productTitle: string;
  imageUrl?: string;
  isFavourite: boolean;
  isAdvertised: boolean;
  totalStock: number;
  totalPipelineStock: number;
  totalInventoryPosition: number;
  totalAvgDailyRate: number;
  worstStatus: StockStatus;
  minDaysUntilStockout: number | null;
  moq: number;
  scaler: number;
  totalSuggestedReorderQty: number;
  variants: SkuDashboardRow[];
}
