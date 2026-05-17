"use client";

import { useMemo } from "react";
import type {
  OrderedBatch,
  SkuDashboardRow,
} from "@/lib/types";

interface Variant {
  variantTitle: string;
  sku: string;
  currentStock: number;
  avgDailySellRate: number;
  batches: OrderedBatch[];
  dashboard?: SkuDashboardRow;
}

interface Props {
  variants: Variant[];
  /** Default 180 days (6 months). */
  horizonDays?: number;
  today?: Date;
}

type SegType = "healthy" | "stockout" | "undated" | "nosales";

interface Segment {
  type: SegType;
  startDay: number;
  endDay: number;
}

interface ArrivalMarker {
  day: number;
  qty: number;
  dateLabel: string;
}

interface SimResult {
  segments: Segment[];
  arrivals: ArrivalMarker[];
  /** Day of first stockout (relative to today), or null if none in horizon. */
  firstStockoutDay: number | null;
  /** Total qty across batches with no ETA (informational only). */
  undatedQty: number;
}

function dayOffsetFromToday(isoDate: string, today: Date): number {
  const t0 = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const d = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10))
  );
  return Math.round((d - t0) / 86400000);
}

function addDays(today: Date, days: number): string {
  const t0 = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const d = new Date(t0 + days * 86400000);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function isoToShort(iso: string): string {
  // yyyy-mm-dd → "31 May"
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function simulate(
  currentStock: number,
  avgRate: number,
  batches: OrderedBatch[],
  horizonDays: number,
  today: Date
): SimResult {
  // No sales: whole row is "no sales", but arrivals still useful.
  if (avgRate <= 0) {
    const arrivals: ArrivalMarker[] = batches
      .filter((b) => b.qty > 0 && b.expectedDate)
      .map((b) => ({
        day: Math.max(0, dayOffsetFromToday(b.expectedDate!, today)),
        qty: b.qty,
        dateLabel: isoToShort(b.expectedDate!),
      }))
      .filter((a) => a.day <= horizonDays);
    const undatedQty = batches
      .filter((b) => b.qty > 0 && !b.expectedDate)
      .reduce((s, b) => s + b.qty, 0);
    return {
      segments: [{ type: "nosales", startDay: 0, endDay: horizonDays }],
      arrivals,
      firstStockoutDay: null,
      undatedQty,
    };
  }

  const datedBatches = batches
    .filter((b) => b.qty > 0 && b.expectedDate)
    .map((b) => ({
      day: Math.max(0, dayOffsetFromToday(b.expectedDate!, today)),
      qty: b.qty,
      dateLabel: isoToShort(b.expectedDate!),
    }))
    .sort((a, b) => a.day - b.day);

  const undatedQty = batches
    .filter((b) => b.qty > 0 && !b.expectedDate)
    .reduce((s, b) => s + b.qty, 0);

  const segments: Segment[] = [];
  let stock = currentStock;
  let cursor = 0;
  let firstStockoutDay: number | null = null;

  const pushHealthy = (start: number, end: number) => {
    if (end > start) segments.push({ type: "healthy", startDay: start, endDay: end });
  };
  const pushStockout = (start: number, end: number) => {
    if (end > start) segments.push({ type: "stockout", startDay: start, endDay: end });
  };

  for (const b of datedBatches) {
    const target = Math.min(b.day, horizonDays);
    if (target <= cursor) {
      // batch in the past or at cursor — just add
      stock += b.qty;
      continue;
    }
    const burnDays = stock / avgRate;
    if (cursor + burnDays >= target) {
      // healthy all the way to target
      pushHealthy(cursor, target);
      stock -= avgRate * (target - cursor);
      cursor = target;
    } else {
      const stockoutAt = cursor + burnDays;
      pushHealthy(cursor, stockoutAt);
      pushStockout(stockoutAt, target);
      if (firstStockoutDay === null) firstStockoutDay = stockoutAt;
      stock = 0;
      cursor = target;
    }
    // batch arrives
    stock += b.qty;
  }

  // Tail after last dated batch until horizon
  if (cursor < horizonDays) {
    const burnDays = stock / avgRate;
    if (cursor + burnDays >= horizonDays) {
      pushHealthy(cursor, horizonDays);
    } else {
      const stockoutAt = cursor + burnDays;
      pushHealthy(cursor, stockoutAt);
      if (firstStockoutDay === null) firstStockoutDay = stockoutAt;
      // Tail beyond stockout: paint as "undated" if there's pending-no-eta
      // qty (we can't say WHEN the stockout ends), otherwise paint stockout.
      if (undatedQty > 0) {
        segments.push({
          type: "undated",
          startDay: stockoutAt,
          endDay: horizonDays,
        });
      } else {
        pushStockout(stockoutAt, horizonDays);
      }
    }
  }

  return {
    segments,
    arrivals: datedBatches.filter((b) => b.day <= horizonDays),
    firstStockoutDay,
    undatedQty,
  };
}

function monthTicks(today: Date, horizonDays: number) {
  const out: { day: number; label: string }[] = [];
  // Today as a labelled tick at day 0
  out.push({
    day: 0,
    label: today.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  });
  // Each month boundary within the horizon
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  for (let i = 1; i <= 7; i++) {
    const m = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)
    );
    const day = Math.round((m.getTime() - start.getTime()) / 86400000);
    if (day > 0 && day < horizonDays) {
      out.push({
        day,
        label: m.toLocaleDateString("en-GB", { month: "short" }),
      });
    }
  }
  return out;
}

function renderVerdict(d: SkuDashboardRow | undefined, today: Date) {
  if (!d) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        No data
      </span>
    );
  }
  const baseClass = "inline-block px-2 py-0.5 rounded-full text-xs font-medium";
  if (d.avgDailySellRate <= 0) {
    return (
      <div>
        <span className={`${baseClass} bg-gray-100 text-gray-500`}>No sales</span>
      </div>
    );
  }
  const totalLead = d.leadTimeDays + d.deliveryTimeDays;
  let reorderByLabel: string | null = null;
  if (d.daysUntilStockout !== null) {
    const reorderByDay = d.daysUntilStockout - totalLead;
    if (reorderByDay < 0) {
      reorderByLabel = `↶ Overdue ${Math.abs(reorderByDay)}d`;
    } else {
      reorderByLabel = `by ${addDays(today, reorderByDay)}`;
    }
  }
  const stockoutLabel =
    d.nextStockoutDate && d.daysUntilStockout !== null && d.daysUntilStockout < 365
      ? `stockout ${isoToShort(d.nextStockoutDate)}`
      : null;

  switch (d.recommendation) {
    case "healthy":
      return (
        <div>
          <span className={`${baseClass} bg-emerald-100 text-emerald-700`}>
            Healthy
          </span>
        </div>
      );
    case "monitor":
      return (
        <div>
          <span className={`${baseClass} bg-amber-100 text-amber-700`}>
            Plan reorder
          </span>
          {reorderByLabel && (
            <div className="text-xs text-gray-500 mt-1">{reorderByLabel}</div>
          )}
        </div>
      );
    case "expedite":
      return (
        <div>
          <span className={`${baseClass} bg-orange-100 text-orange-700`}>
            ⚡ Expedite
          </span>
          {d.nextArrivalAfterStockout && (
            <div className="text-xs text-gray-500 mt-1">
              {d.nextArrivalAfterStockout.qty}u arrives{" "}
              {isoToShort(d.nextArrivalAfterStockout.expectedDate)} ·{" "}
              {d.nextArrivalAfterStockout.daysFromStockout}d late
            </div>
          )}
        </div>
      );
    case "reorder":
      return (
        <div>
          <span className={`${baseClass} bg-red-100 text-red-700`}>
            🔻 Reorder
          </span>
          {stockoutLabel && (
            <div className="text-xs text-gray-500 mt-1">{stockoutLabel}</div>
          )}
        </div>
      );
    case "set-eta":
      return (
        <div>
          <span className={`${baseClass} bg-red-100 text-red-700`}>
            ⚠ Set ETA
          </span>
          <div className="text-xs text-gray-500 mt-1">
            {d.undatedOnOrder}u has no arrival date
          </div>
        </div>
      );
    default:
      return null;
  }
}

export default function StockTimeline({
  variants,
  horizonDays = 180,
  today = new Date(),
}: Props) {
  const ticks = useMemo(() => monthTicks(today, horizonDays), [today, horizonDays]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="font-medium text-gray-700 text-sm">
          Stock Timeline ({horizonDays} days)
        </span>
        <Legend />
      </div>

      <div className="px-4 py-4">
        {variants.map((v) => {
          const sim = simulate(
            v.currentStock,
            v.avgDailySellRate,
            v.batches,
            horizonDays,
            today
          );
          const d = v.dashboard;
          // Reorder-by position in % of horizon (clamped).
          let reorderByLeftPct: number | null = null;
          let reorderByOverdue = false;
          if (
            d &&
            d.avgDailySellRate > 0 &&
            d.daysUntilStockout !== null &&
            d.daysUntilStockout < 365 * 2
          ) {
            const totalLead = d.leadTimeDays + d.deliveryTimeDays;
            const day = d.daysUntilStockout - totalLead;
            if (day < 0) {
              reorderByLeftPct = 0;
              reorderByOverdue = true;
            } else if (day <= horizonDays) {
              reorderByLeftPct = (day / horizonDays) * 100;
            }
          }
          return (
            <div
              key={v.sku}
              className="grid items-center gap-4 py-3 border-b border-gray-100 last:border-b-0"
              style={{ gridTemplateColumns: "70px 1fr 200px" }}
            >
              {/* Label */}
              <div>
                <div className="font-semibold text-gray-900 text-sm">
                  {v.variantTitle}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {v.currentStock}u ·{" "}
                  {v.avgDailySellRate > 0
                    ? `${v.avgDailySellRate.toFixed(1)}/day`
                    : "no sales"}
                </div>
              </div>

              {/* Timeline bar */}
              <div className="relative h-7 bg-gray-100 rounded">
                {sim.segments.map((s, i) => {
                  const left = (s.startDay / horizonDays) * 100;
                  const width = ((s.endDay - s.startDay) / horizonDays) * 100;
                  return (
                    <div
                      key={i}
                      className={`absolute top-0 h-full ${segClass(s.type)}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={segTitle(s, today)}
                    />
                  );
                })}
                {/* Today marker */}
                <div
                  className="absolute -top-1 -bottom-1 w-0.5 bg-gray-900 z-10"
                  style={{ left: "0%" }}
                  title="Today"
                />
                {/* Reorder-by marker */}
                {reorderByLeftPct !== null && (
                  <div
                    className="absolute -top-1 -bottom-1 z-10 flex items-end"
                    style={{
                      left: `${reorderByLeftPct}%`,
                      transform: "translateX(-50%)",
                    }}
                    title={
                      reorderByOverdue
                        ? "Reorder-by date is in the past"
                        : "Latest date to place an order to avoid stockout"
                    }
                  >
                    <div
                      className="w-0 border-l-2 border-dashed border-red-500"
                      style={{ height: "calc(100% + 8px)" }}
                    />
                  </div>
                )}
                {/* Arrival triangles */}
                {sim.arrivals.map((a, i) => (
                  <div
                    key={i}
                    className="absolute -top-3 text-amber-600 text-xs"
                    style={{
                      left: `${(a.day / horizonDays) * 100}%`,
                      transform: "translateX(-50%)",
                    }}
                    title={`+${a.qty}u arriving ${a.dateLabel}`}
                  >
                    ▲
                  </div>
                ))}
              </div>

              {/* Verdict */}
              <div>{renderVerdict(d, today)}</div>
            </div>
          );
        })}

        {/* Date axis */}
        <div
          className="grid gap-4 mt-2"
          style={{ gridTemplateColumns: "70px 1fr 200px" }}
        >
          <div />
          <div className="relative h-5 border-t border-gray-200">
            {ticks.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 text-xs text-gray-400"
                style={{
                  left: `${(t.day / horizonDays) * 100}%`,
                  transform: "translateX(-50%)",
                  paddingTop: 4,
                }}
              >
                {t.label}
              </div>
            ))}
          </div>
          <div />
        </div>
      </div>
    </div>
  );
}

function segClass(t: SegType): string {
  switch (t) {
    case "healthy":
      return "bg-emerald-500/80";
    case "stockout":
      return "bg-red-500/80 bg-[repeating-linear-gradient(45deg,#ef4444_0,#ef4444_4px,#dc2626_4px,#dc2626_8px)]";
    case "undated":
      return "bg-gray-300/80 bg-[repeating-linear-gradient(90deg,#d1d5db_0,#d1d5db_4px,#f3f4f6_4px,#f3f4f6_8px)]";
    case "nosales":
      return "bg-gray-200";
  }
}

function segTitle(s: Segment, today: Date): string {
  const start = addDays(today, Math.round(s.startDay));
  const end = addDays(today, Math.round(s.endDay));
  const labelMap: Record<SegType, string> = {
    healthy: "Healthy stock",
    stockout: "Stockout",
    undated: "Undated batch — can't plan past here",
    nosales: "No sales",
  };
  return `${labelMap[s.type]}: ${start} → ${end}`;
}

function Legend() {
  const Swatch = ({ cls }: { cls: string }) => (
    <span className={`inline-block w-4 h-2.5 rounded-sm ${cls}`} />
  );
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span className="flex items-center gap-1">
        <Swatch cls="bg-emerald-500/80" /> Healthy
      </span>
      <span className="flex items-center gap-1">
        <Swatch cls="bg-[repeating-linear-gradient(45deg,#ef4444_0,#ef4444_3px,#dc2626_3px,#dc2626_6px)]" />{" "}
        Stockout
      </span>
      <span className="flex items-center gap-1">
        <Swatch cls="bg-[repeating-linear-gradient(90deg,#d1d5db_0,#d1d5db_3px,#f3f4f6_3px,#f3f4f6_6px)]" />{" "}
        Undated
      </span>
      <span className="text-amber-600">▲ Arrival</span>
      <span className="text-gray-700">| Today</span>
      <span className="text-red-500">┊ Reorder by</span>
    </div>
  );
}
