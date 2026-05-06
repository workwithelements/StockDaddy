import type {
  DailySalesEntry,
  StockStatus,
  SkuDashboardRow,
  CachedProductData,
  CachedOrderData,
  SkuConfigStore,
  AlertHistoryStore,
  ProductConfigStore,
  ProductGroupRow,
  StockLocationStore,
} from "./types";

const DEFAULT_LEAD_TIME = 28;
const DEFAULT_DELIVERY_TIME = 0;
const DEFAULT_SAFETY_STOCK = 0;
const DEFAULT_SAFETY_DAYS = 7;
const DEFAULT_SELL_THROUGH_WINDOW: 7 | 14 | 30 | 60 | 90 = 7;
// Days of cover the next reorder should leave you with after it lands. Keeps
// reorder cycles roughly monthly without manual tuning.
const DEFAULT_COVER_PERIOD_DAYS = 30;
// EWMA smoothing factor: weight given to the most recent day. Higher = more
// reactive to recent activity, lower = more stable.
const EWMA_ALPHA = 0.3;
// Default minimum order quantity if no per-product MOQ is set.
const DEFAULT_PRODUCT_MOQ = 100;

export function getResolvedConfig(
  sku: string,
  productId: string,
  skuConfigs: SkuConfigStore,
  productConfigs: ProductConfigStore
): {
  leadTimeDays: number;
  deliveryTimeDays: number;
  safetyStock: number;
  safetyDays: number;
  sellThroughWindow: 7 | 14 | 30 | 60 | 90;
} {
  const skuCfg = skuConfigs.configs[sku];
  const prodCfg = productConfigs.configs[productId];

  return {
    leadTimeDays:
      skuCfg?.leadTimeDays ?? prodCfg?.leadTimeDays ?? DEFAULT_LEAD_TIME,
    deliveryTimeDays:
      skuCfg?.deliveryTimeDays ?? prodCfg?.deliveryTimeDays ?? DEFAULT_DELIVERY_TIME,
    safetyStock: skuCfg?.safetyStock ?? DEFAULT_SAFETY_STOCK,
    safetyDays: skuCfg?.safetyDays ?? DEFAULT_SAFETY_DAYS,
    sellThroughWindow: skuCfg?.sellThroughWindow ?? DEFAULT_SELL_THROUGH_WINDOW,
  };
}

/**
 * Exponentially-weighted moving average of daily sell rate over the window.
 * Recent days count more (α=0.3 by default), so a relaunch / promo shows up
 * faster than a flat moving average would, without being as twitchy as a 1-day
 * snapshot. Iterates per-day so zero-sale days correctly drag the rate down.
 */
export function calculateAvgDailySellRate(
  dailySales: DailySalesEntry[],
  windowDays: number,
  alpha: number = EWMA_ALPHA
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const salesByDate = new Map<string, number>();
  for (const entry of dailySales) {
    salesByDate.set(entry.date, (salesByDate.get(entry.date) ?? 0) + entry.quantity);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (let daysAgo = 1; daysAgo <= windowDays; daysAgo++) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().split("T")[0];
    const qty = salesByDate.get(dateStr) ?? 0;
    const weight = alpha * Math.pow(1 - alpha, daysAgo - 1);
    weightedSum += qty * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

export function calculateDaysUntilStockout(
  currentStock: number,
  avgDailySellRate: number
): number | null {
  if (avgDailySellRate <= 0) return null;
  return Math.floor(currentStock / avgDailySellRate);
}

/**
 * Effective safety stock = days-of-cover converted to units + any flat unit
 * buffer the user has set. Days-of-cover scales naturally with demand so the
 * default works without per-SKU tuning.
 */
export function calculateEffectiveSafetyStock(
  avgDailySellRate: number,
  safetyStock: number,
  safetyDays: number
): number {
  return Math.ceil(avgDailySellRate * safetyDays) + safetyStock;
}

/**
 * Reorder point: the inventory position at which we should place a new order
 * to avoid eating into safety stock during the lead time. Classic ROP formula.
 */
export function calculateReorderPoint(
  avgDailySellRate: number,
  leadTimeDays: number,
  deliveryTimeDays: number,
  effectiveSafetyStock: number
): number {
  return (
    Math.ceil(avgDailySellRate * (leadTimeDays + deliveryTimeDays)) +
    effectiveSafetyStock
  );
}

export function calculateSuggestedReorderQty(
  avgDailySellRate: number,
  leadTimeDays: number,
  deliveryTimeDays: number,
  effectiveSafetyStock: number,
  pipelineStock: number = 0,
  coverPeriodDays: number = DEFAULT_COVER_PERIOD_DAYS
): number {
  // Cover demand during lead time + a buffer period of stock once it lands,
  // minus what's already on the way.
  const totalNeed =
    Math.ceil(
      avgDailySellRate * (leadTimeDays + deliveryTimeDays + coverPeriodDays)
    ) + effectiveSafetyStock;
  return Math.max(0, totalNeed - pipelineStock);
}

/**
 * Status from the inventory position vs reorder point. red when at/below
 * ROP (we should already have ordered), yellow within 50% of ROP (watch),
 * green otherwise. No sales → green (nothing to do).
 */
export function determineStockStatus(
  inventoryPosition: number,
  reorderPoint: number,
  avgDailySellRate: number
): { status: StockStatus; reorderNeeded: boolean } {
  if (avgDailySellRate <= 0) {
    return { status: "green", reorderNeeded: false };
  }
  if (inventoryPosition <= reorderPoint) {
    return { status: "red", reorderNeeded: true };
  }
  if (inventoryPosition <= reorderPoint * 1.5) {
    return { status: "yellow", reorderNeeded: false };
  }
  return { status: "green", reorderNeeded: false };
}

/**
 * Distribute MOQ across variants proportionally by sell rate.
 * Applies scaler to each variant's base qty.
 * Total will be at least MOQ if any variant needs reorder.
 */
export function calculateMOQDistribution(
  variants: SkuDashboardRow[],
  moq: number,
  scaler: number
): Map<string, number> {
  const result = new Map<string, number>();

  const totalRate = variants.reduce((sum, v) => sum + v.avgDailySellRate, 0);

  if (totalRate <= 0 || moq <= 0) {
    // No sales data or no MOQ — just scale individual suggested qtys
    for (const v of variants) {
      result.set(v.sku, Math.ceil(v.suggestedReorderQty * scaler));
    }
    return result;
  }

  // Proportional distribution based on sell rate
  let rawTotal = 0;
  const rawQtys: Array<{ sku: string; qty: number }> = [];

  for (const v of variants) {
    const proportion = v.avgDailySellRate / totalRate;
    const baseQty = Math.ceil(v.suggestedReorderQty * scaler);
    const proportionalQty = Math.ceil(moq * proportion * scaler);
    // Use larger of proportional MOQ share or scaled base need
    const qty = Math.max(baseQty, proportionalQty);
    rawQtys.push({ sku: v.sku, qty });
    rawTotal += qty;
  }

  // If total is less than MOQ, bump up proportionally
  if (rawTotal < moq) {
    const deficit = moq - rawTotal;
    for (let i = 0; i < rawQtys.length; i++) {
      const v = variants[i];
      const proportion = v.avgDailySellRate / totalRate;
      rawQtys[i].qty += Math.ceil(deficit * proportion);
    }
  }

  for (const { sku, qty } of rawQtys) {
    result.set(sku, qty);
  }

  return result;
}

export function buildDashboardRows(
  products: CachedProductData,
  orders: CachedOrderData,
  skuConfigs: SkuConfigStore,
  alerts: AlertHistoryStore,
  productConfigs: ProductConfigStore,
  stockLocations: StockLocationStore
): SkuDashboardRow[] {
  const rows: SkuDashboardRow[] = [];

  for (const product of products.products) {
    const productId = String(product.id);

    for (const variant of product.variants) {
      const sku = variant.sku || `_auto_${productId}_${variant.id}`;

      const config = getResolvedConfig(
        sku,
        productId,
        skuConfigs,
        productConfigs
      );
      const sales = orders.dailySales[sku] || [];
      const avgRate = calculateAvgDailySellRate(sales, config.sellThroughWindow);

      // Inventory position = sellable now + on-order. We don't hold stock in
      // China and uk3pl is the same physical stock as Shopify's count, so
      // neither feeds in here.
      const loc = stockLocations.locations[sku];
      const pipelineStock = loc?.ordered ?? 0;
      const orderedExpectedDate = loc?.orderedExpectedDate;
      const currentStock = variant.inventory_quantity;
      const inventoryPosition = currentStock + pipelineStock;

      const effectiveSafetyStock = calculateEffectiveSafetyStock(
        avgRate,
        config.safetyStock,
        config.safetyDays
      );
      const reorderPoint = calculateReorderPoint(
        avgRate,
        config.leadTimeDays,
        config.deliveryTimeDays,
        effectiveSafetyStock
      );
      const daysLeft = calculateDaysUntilStockout(inventoryPosition, avgRate);
      const { status, reorderNeeded } = determineStockStatus(
        inventoryPosition,
        reorderPoint,
        avgRate
      );
      const suggestedQty = calculateSuggestedReorderQty(
        avgRate,
        config.leadTimeDays,
        config.deliveryTimeDays,
        effectiveSafetyStock,
        pipelineStock
      );

      const alert = alerts.alerts[sku];
      const hasActiveAlert = alert ? !alert.dismissed : false;

      rows.push({
        productId,
        productTitle: product.title,
        variantTitle: variant.title,
        sku,
        imageUrl: product.image?.src,
        currentStock,
        pipelineStock,
        orderedExpectedDate,
        inventoryPosition,
        avgDailySellRate: avgRate,
        daysUntilStockout: daysLeft,
        reorderStatus: status,
        reorderNeeded,
        reorderPoint,
        leadTimeDays: config.leadTimeDays,
        deliveryTimeDays: config.deliveryTimeDays,
        safetyStock: config.safetyStock,
        safetyDays: config.safetyDays,
        effectiveSafetyStock,
        suggestedReorderQty: suggestedQty,
        moqSuggestedQty: suggestedQty,
        sellThroughWindow: config.sellThroughWindow,
        hasActiveAlert,
      });
    }
  }

  // Sort: red first, then yellow, then green
  const statusOrder: Record<StockStatus, number> = { red: 0, yellow: 1, green: 2 };
  rows.sort((a, b) => {
    const statusDiff = statusOrder[a.reorderStatus] - statusOrder[b.reorderStatus];
    if (statusDiff !== 0) return statusDiff;
    const aDays = a.daysUntilStockout ?? Infinity;
    const bDays = b.daysUntilStockout ?? Infinity;
    return aDays - bDays;
  });

  return rows;
}

/**
 * Group rows by product, compute aggregates, apply MOQ distribution.
 * Sort: favourites first → worst status → min days left.
 */
export function buildProductGroups(
  rows: SkuDashboardRow[],
  productConfigs: ProductConfigStore
): ProductGroupRow[] {
  const statusOrder: Record<StockStatus, number> = { red: 0, yellow: 1, green: 2 };

  // Group rows by productId
  const groupMap = new Map<string, SkuDashboardRow[]>();
  for (const row of rows) {
    const existing = groupMap.get(row.productId) || [];
    existing.push(row);
    groupMap.set(row.productId, existing);
  }

  const groups: ProductGroupRow[] = [];

  for (const [productId, variants] of groupMap) {
    const prodCfg = productConfigs.configs[productId];
    // Treat 0 as "use default" so any product without a real MOQ set gets the
    // 100-unit minimum the user wants by default.
    const moq = prodCfg?.moq && prodCfg.moq > 0 ? prodCfg.moq : DEFAULT_PRODUCT_MOQ;
    const scaler = prodCfg?.scaler ?? 1;
    const isFavourite = prodCfg?.isFavourite ?? false;
    const isAdvertised = prodCfg?.isAdvertised ?? false;

    // Apply MOQ distribution if moq > 0
    if (moq > 0) {
      const distribution = calculateMOQDistribution(variants, moq, scaler);
      for (const v of variants) {
        v.moqSuggestedQty = distribution.get(v.sku) ?? v.suggestedReorderQty;
      }
    } else if (scaler !== 1) {
      for (const v of variants) {
        v.moqSuggestedQty = Math.ceil(v.suggestedReorderQty * scaler);
      }
    }

    // Sort variants within group
    variants.sort((a, b) => {
      const statusDiff =
        statusOrder[a.reorderStatus] - statusOrder[b.reorderStatus];
      if (statusDiff !== 0) return statusDiff;
      const aDays = a.daysUntilStockout ?? Infinity;
      const bDays = b.daysUntilStockout ?? Infinity;
      return aDays - bDays;
    });

    const first = variants[0];

    const totalStock = variants.reduce((s, v) => s + v.currentStock, 0);
    const totalPipelineStock = variants.reduce((s, v) => s + v.pipelineStock, 0);
    const totalInventoryPosition = totalStock + totalPipelineStock;
    const totalAvgDailyRate = variants.reduce((s, v) => s + v.avgDailySellRate, 0);
    const totalSuggestedReorderQty = variants.reduce(
      (s, v) => s + v.moqSuggestedQty,
      0
    );

    let worstStatus: StockStatus = "green";
    let minDaysUntilStockout: number | null = null;
    for (const v of variants) {
      if (statusOrder[v.reorderStatus] < statusOrder[worstStatus]) {
        worstStatus = v.reorderStatus;
      }
      if (v.daysUntilStockout !== null) {
        if (
          minDaysUntilStockout === null ||
          v.daysUntilStockout < minDaysUntilStockout
        ) {
          minDaysUntilStockout = v.daysUntilStockout;
        }
      }
    }

    groups.push({
      productId,
      productTitle: first.productTitle,
      imageUrl: first.imageUrl,
      isFavourite,
      isAdvertised,
      totalStock,
      totalPipelineStock,
      totalInventoryPosition,
      totalAvgDailyRate,
      worstStatus,
      minDaysUntilStockout,
      moq,
      scaler,
      totalSuggestedReorderQty,
      variants,
    });
  }

  // Sort: favourites first → worst status → min days left
  groups.sort((a, b) => {
    if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
    const statusDiff = statusOrder[a.worstStatus] - statusOrder[b.worstStatus];
    if (statusDiff !== 0) return statusDiff;
    const aDays = a.minDaysUntilStockout ?? Infinity;
    const bDays = b.minDaysUntilStockout ?? Infinity;
    return aDays - bDays;
  });

  return groups;
}
