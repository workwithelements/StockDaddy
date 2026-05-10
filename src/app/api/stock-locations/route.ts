import { NextRequest, NextResponse } from "next/server";
import { getStockLocations, setStockLocations } from "@/lib/storage";
import type { OrderedBatch, StockLocationEntry } from "@/lib/types";
import { generateBatchId, normalizeEntry } from "@/lib/orderedBatches";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getStockLocations();
  // Normalise every entry on read so consumers don't have to think about
  // legacy single-order fields.
  const normalised: typeof store = {
    ...store,
    locations: Object.fromEntries(
      Object.entries(store.locations).map(([sku, entry]) => [
        sku,
        normalizeEntry(entry),
      ])
    ),
  };
  return NextResponse.json(normalised);
}

interface PutBody {
  /** Mode: replace this SKU's batches wholesale */
  setBatches?: Record<string, OrderedBatch[]>;
  /** Mode: append a new batch per SKU (used by Order Planner). All SKUs in
   *  the batch share the same placedDate + expectedDate so they read as one
   *  logical PO. */
  addBatch?: {
    expectedDate?: string;
    placedDate?: string;
    items: Record<string, number>; // sku → qty
  };
  /** Mode: remove a batch by id from any SKU that has it. */
  deleteBatch?: { batchId: string };
  /** Mode: mark a batch received — same as deleteBatch (ledger goes to 0
   *  and the deduction shows up via Shopify on next sync). */
  receiveBatch?: { batchId: string };
}

export async function PUT(request: NextRequest) {
  const body: PutBody = await request.json();
  const store = await getStockLocations();

  if (body.setBatches) {
    for (const [sku, batches] of Object.entries(body.setBatches)) {
      const existing = normalizeEntry(store.locations[sku]);
      store.locations[sku] = { ...existing, orderedBatches: batches };
    }
  }

  if (body.addBatch) {
    const placed = body.addBatch.placedDate || new Date().toISOString().split("T")[0];
    const id = generateBatchId();
    for (const [sku, qty] of Object.entries(body.addBatch.items)) {
      if (qty <= 0) continue;
      const existing = normalizeEntry(store.locations[sku]);
      const newBatch: OrderedBatch = {
        id,
        qty,
        expectedDate: body.addBatch.expectedDate,
        placedDate: placed,
      };
      store.locations[sku] = {
        ...existing,
        orderedBatches: [...existing.orderedBatches, newBatch],
      };
    }
  }

  if (body.deleteBatch || body.receiveBatch) {
    const batchId = (body.deleteBatch || body.receiveBatch)!.batchId;
    for (const [sku, entry] of Object.entries(store.locations)) {
      const normalised = normalizeEntry(entry);
      const filtered = normalised.orderedBatches.filter((b) => b.id !== batchId);
      if (filtered.length !== normalised.orderedBatches.length) {
        store.locations[sku] = { ...normalised, orderedBatches: filtered };
      }
    }
  }

  store.updatedAt = new Date().toISOString();
  await setStockLocations(store);

  return NextResponse.json({ success: true });
}
