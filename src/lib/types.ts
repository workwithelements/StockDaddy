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
  safetyDays?: number;
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

export interface OrderedBatch {
  id: string;
  qty: number;
  /** ISO date (yyyy-mm-dd) when the batch is expected to land. */
  expectedDate?: string;
  /** ISO date (yyyy-mm-dd) when the PO was raised. */
  placedDate?: string;
}

export interface StockLocationEntry {
  /** Array of in-flight order batches. Each batch is one PO line for this SKU. */
  orderedBatches: OrderedBatch[];
  /** Legacy single-order fields. Kept optional so older blob entries still
   *  deserialize; on first write we migrate them into orderedBatches. */
  ordered?: number;
  orderedExpectedDate?: string;
  /** Legacy fields, no longer surfaced. */
  uk3pl?: number;
  china?: number;
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
  orderedExpectedDate?: string;
  inventoryPosition: number;
  avgDailySellRate: number;
  daysUntilStockout: number | null;
  /** ISO date (yyyy-mm-dd) when stock is first projected to hit 0, accounting
   *  for the timing of each incoming batch. null when there are no sales. */
  nextStockoutDate?: string;
  /** True when current/pipeline stock will hit 0 BEFORE the latest scheduled
   *  batch arrives — i.e. there's a gap in supply we can't cover. */
  hasGap: boolean;
  /** Sum of qty across batches missing an ETA. Excluded from the runway
   *  simulation; surfaced separately so the user can set the missing date. */
  undatedOnOrder: number;
  /** Next scheduled batch arriving AFTER the projected stockout, if any.
   *  Lets the UI surface "expedite this batch" vs "place a new order"
   *  recommendations instead of a blanket "Reorder Now". */
  nextArrivalAfterStockout?: {
    expectedDate: string;
    qty: number;
    daysFromStockout: number;
  };
  /** Short, actionable recommendation tag for this variant. */
  recommendation: "healthy" | "monitor" | "expedite" | "reorder" | "set-eta";
  reorderStatus: StockStatus;
  reorderNeeded: boolean;
  reorderPoint: number;
  leadTimeDays: number;
  deliveryTimeDays: number;
  safetyStock: number;
  safetyDays: number;
  effectiveSafetyStock: number;
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
