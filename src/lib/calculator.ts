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
} from "./types";

const DEFAULT_LEAD_TIME = 28;
const DEFAULT_DELIVERY_TIME = 0;
const DEFAULT_SAFETY_STOCK = 0;
const DEFAULT_SELL_THROUGH_WINDOW: 30 | 60 | 90 = 30;

/**
 * Resolve config with fallback chain: SKU override → product config → defaults
 */
export function getResolvedConfig(
  sku: string,
  productId: string,
  skuConfigs: SkuConfigStore,
  productConfigs: ProductConfigStore
): {
  leadTimeDays: number;
  deliveryTimeDays: number;
  safetyStock: number;
  sellThroughWindow: 30 | 60 | 90;
} {
  const skuCfg = skuConfigs.configs[sku];
  const prodCfg = productConfigs.configs[productId];

  return {
    leadTimeDays:
      skuCfg?.leadTimeDays ?? prodCfg?.leadTimeDays ?? DEFAULT_LEAD_TIME,
    deliveryTimeDays:
      skuCfg?.deliveryTimeDays ?? prodCfg?.deliveryTimeDays ?? DEFAULT_DELIVERY_TIME,
    safetyStock: skuCfg?.safetyStock ?? DEFAULT_SAFETY_STOCK,
    sellThroughWindow: skuCfg?.sellThroughWindow ?? DEFAULT_SELL_THROUGH_WINDOW,
  };
}

export function calculateAvgDailySellRate(
  dailySales: DailySalesEntry[],
  windowDays: number
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  let totalQty = 0;
  for (const entry of dailySales) {
    if (entry.date >= cutoffStr) {
      totalQty += entry.quantity;
    }
  }

  return Math.round((totalQty / windowDays) * 100) / 100;
}

export function calculateDaysUntilStockout(
  currentStock: number,
  avgDailySellRate: number
): number | null {
  if (avgDailySellRate <= 0) return null;
  return Math.floor(currentStock / avgDailySellRate);
}

export function calculateSuggestedReorderQty(
  avgDailySellRate: number,
  leadTimeDays: number,
  deliveryTimeDays: number,
  safetyStock: number
): number {
  return Math.max(
    0,
    Math.ceil(avgDailySellRate * (leadTimeDays + deliveryTimeDays)) + safetyStock
  );
}

export function determineStockStatus(
  daysUntilStockout: number | null,
  leadTimeDays: number,
  deliveryTimeDays: number
): { status: StockStatus; reorderNeeded: boolean } {
  const totalLeadTime = leadTimeDays + deliveryTimeDays;

  if (daysUntilStockout === null) {
    return { status: "green", reorderNeeded: false };
  }

  if (daysUntilStockout <= totalLeadTime) {
    return { status: "red", reorderNeeded: true };
  }

  if (daysUntilStockout <= totalLeadTime * 1.5) {
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
  productConfigs: ProductConfigStore
): SkuDashboardRow[] {
  const rows: SkuDashboardRow[] = [];

  for (const product of products.products) {
    const productId = String(product.id);

    for (const variant of product.variants) {
      // Use real SKU or generate a synthetic one from product+variant ID
      const sku = variant.sku || `_auto_${productId}_${variant.id}`;

      const config = getResolvedConfig(
        sku,
        productId,
        skuConfigs,
        productConfigs
      );
      const sales = orders.dailySales[sku] || [];
      const avgRate = calculateAvgDailySellRate(sales, config.sellThroughWindow);
      const daysLeft = calculateDaysUntilStockout(variant.inventory_quantity, avgRate);
      const { status, reorderNeeded } = determineStockStatus(
        daysLeft,
        config.leadTimeDays,
        config.deliveryTimeDays
      );
      const suggestedQty = calculateSuggestedReorderQty(
        avgRate,
        config.leadTimeDays,
        config.deliveryTimeDays,
        config.safetyStock
      );

      const alert = alerts.alerts[sku];
      const hasActiveAlert = alert ? !alert.dismissed : false;

      rows.push({
        productId,
        productTitle: product.title,
        variantTitle: variant.title,
        sku,
        imageUrl: product.image?.src,
        currentStock: variant.inventory_quantity,
        avgDailySellRate: avgRate,
        daysUntilStockout: daysLeft,
        reorderStatus: status,
        reorderNeeded,
        leadTimeDays: config.leadTimeDays,
        deliveryTimeDays: config.deliveryTimeDays,
        safetyStock: config.safetyStock,
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
    const moq = prodCfg?.moq ?? 0;
    const scaler = prodCfg?.scaler ?? 1;
    const isFavourite = prodCfg?.isFavourite ?? false;

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
      totalStock,
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
