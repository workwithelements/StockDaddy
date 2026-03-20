import type { StockStatus } from "@/lib/types";

const statusStyles: Record<StockStatus, { bg: string; text: string; label: string }> = {
  red: { bg: "bg-red-100", text: "text-red-800", label: "Reorder Now" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Low Stock" },
  green: { bg: "bg-green-100", text: "text-green-800", label: "Healthy" },
};

export default function StatusBadge({ status }: { status: StockStatus }) {
  const style = statusStyles[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
