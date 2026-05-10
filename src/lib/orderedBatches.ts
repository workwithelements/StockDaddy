import type { OrderedBatch, StockLocationEntry, StockLocationStore } from "./types";

/**
 * Coerce a (possibly legacy) entry into the new shape. If `orderedBatches`
 * is missing but a legacy single-order pair is present, fold it into one
 * synthetic batch so callers never have to branch.
 */
export function normalizeEntry(entry: StockLocationEntry | undefined): StockLocationEntry {
  if (!entry) return { orderedBatches: [] };
  if (entry.orderedBatches && entry.orderedBatches.length > 0) {
    return { ...entry, orderedBatches: entry.orderedBatches };
  }
  if (entry.ordered && entry.ordered > 0) {
    const synthetic: OrderedBatch = {
      id: `legacy-${Math.random().toString(36).slice(2, 10)}`,
      qty: entry.ordered,
      expectedDate: entry.orderedExpectedDate,
    };
    return { ...entry, orderedBatches: [synthetic] };
  }
  return { ...entry, orderedBatches: [] };
}

export function totalOrdered(entry: StockLocationEntry | undefined): number {
  if (!entry) return 0;
  const batches = entry.orderedBatches ?? [];
  if (batches.length > 0) return batches.reduce((s, b) => s + b.qty, 0);
  return entry.ordered ?? 0;
}

export function earliestEta(entry: StockLocationEntry | undefined): string | undefined {
  if (!entry) return undefined;
  const dates = (entry.orderedBatches ?? [])
    .map((b) => b.expectedDate)
    .filter((d): d is string => !!d);
  if (dates.length === 0) return entry.orderedExpectedDate;
  return dates.sort()[0];
}

/**
 * FIFO deduction across a SKU's open batches when stock arrives at the
 * warehouse. Returns the updated batch list and the amount actually deducted.
 */
export function deductFromBatches(
  entry: StockLocationEntry | undefined,
  amount: number
): { batches: OrderedBatch[]; deducted: number } {
  const normalized = normalizeEntry(entry);
  if (amount <= 0) {
    return { batches: normalized.orderedBatches, deducted: 0 };
  }
  // FIFO by expectedDate (earliest first); undated batches sort last.
  const sorted = [...normalized.orderedBatches].sort((a, b) => {
    if (a.expectedDate && b.expectedDate) return a.expectedDate.localeCompare(b.expectedDate);
    if (a.expectedDate && !b.expectedDate) return -1;
    if (!a.expectedDate && b.expectedDate) return 1;
    return 0;
  });
  let remaining = amount;
  const out: OrderedBatch[] = [];
  for (const b of sorted) {
    if (remaining <= 0) {
      out.push(b);
      continue;
    }
    if (b.qty <= remaining) {
      remaining -= b.qty;
      // batch fully consumed — drop it
    } else {
      out.push({ ...b, qty: b.qty - remaining });
      remaining = 0;
    }
  }
  return { batches: out, deducted: amount - remaining };
}

export function generateBatchId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Group a SKU's batches across all variants of a product into "logical POs"
 * by matching placedDate + expectedDate. Used for the ProductStockPage UI.
 */
export interface LogicalPO {
  key: string; // placed|expected
  placedDate?: string;
  expectedDate?: string;
  // SKU → batch in this PO. May be missing for a SKU if not part of this PO.
  bySku: Record<string, OrderedBatch>;
}

export function groupBatchesIntoPOs(
  skus: string[],
  store: StockLocationStore
): LogicalPO[] {
  const map = new Map<string, LogicalPO>();
  for (const sku of skus) {
    const entry = normalizeEntry(store.locations[sku]);
    for (const batch of entry.orderedBatches) {
      const key = `${batch.placedDate ?? ""}|${batch.expectedDate ?? ""}`;
      const existing = map.get(key);
      if (existing) {
        existing.bySku[sku] = batch;
      } else {
        map.set(key, {
          key,
          placedDate: batch.placedDate,
          expectedDate: batch.expectedDate,
          bySku: { [sku]: batch },
        });
      }
    }
  }
  // Sort by ETA ascending, undated last.
  return [...map.values()].sort((a, b) => {
    if (a.expectedDate && b.expectedDate)
      return a.expectedDate.localeCompare(b.expectedDate);
    if (a.expectedDate && !b.expectedDate) return -1;
    if (!a.expectedDate && b.expectedDate) return 1;
    return 0;
  });
}
