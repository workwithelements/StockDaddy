import type { SkuDashboardRow } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("[StockDaddy] Telegram not configured (missing token or chat ID)");
    return true; // tracked-only mode, like the old slack.ts behavior
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Telegram send failed (${res.status}): ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Telegram send threw:", err);
    return false;
  }
}

export async function sendStockAlert(row: SkuDashboardRow): Promise<boolean> {
  const title = escapeHtml(row.productTitle);
  const variant = escapeHtml(row.variantTitle);
  const sku = escapeHtml(row.sku);
  const pipelineNote =
    row.pipelineStock > 0 ? ` (+${row.pipelineStock} incoming)` : "";
  const leadTime = row.leadTimeDays + row.deliveryTimeDays;
  const ts = new Date().toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  const text =
    `<b>🔻 Reorder: ${title}</b>\n` +
    `<i>${variant}</i>\n\n` +
    `<b>SKU:</b> <code>${sku}</code>\n` +
    `<b>Stock:</b> ${row.currentStock}${pipelineNote}\n` +
    `<b>Avg/day:</b> ${row.avgDailySellRate.toFixed(1)}\n` +
    `<b>Days left:</b> ${row.daysUntilStockout ?? "N/A"}\n` +
    `<b>Lead time:</b> ${leadTime} days\n` +
    `<b>Reorder qty:</b> ${row.moqSuggestedQty || row.suggestedReorderQty}\n\n` +
    `<i>StockDaddy · ${ts} UTC</i>`;

  return sendTelegramMessage(text);
}

export async function sendTestAlert(): Promise<boolean> {
  const ts = new Date().toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return sendTelegramMessage(
    `<b>✅ StockDaddy test alert</b>\n\nIf you can read this, the Telegram integration is wired up correctly.\n\n<i>${ts} UTC</i>`
  );
}
