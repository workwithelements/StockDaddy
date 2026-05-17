import type { ProductGroupRow } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface SendResult {
  ok: boolean;
  reason?: string;
}

async function sendTelegramMessage(text: string): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) return { ok: false, reason: "TELEGRAM_BOT_TOKEN not set" };
  if (!chatId) return { ok: false, reason: "TELEGRAM_CHAT_ID not set" };

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
      return { ok: false, reason: `Telegram API ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Telegram fetch threw: ${String(err)}` };
  }
}

export async function sendProductReorderAlert(
  group: ProductGroupRow
): Promise<boolean> {
  const title = escapeHtml(group.productTitle);
  const totalQty = group.totalSuggestedReorderQty;
  const leadTime = group.variants[0]?.leadTimeDays ?? 0;
  const deliveryTime = group.variants[0]?.deliveryTimeDays ?? 0;
  const totalLead = leadTime + deliveryTime;

  // Pick the dominant recommendation across red variants for the header verb.
  const reds = group.variants.filter((v) => v.reorderStatus === "red");
  const recs = new Set(reds.map((v) => v.recommendation));
  const header = recs.has("set-eta")
    ? `<b>⚠ Set arrival date: ${title}</b>`
    : recs.has("expedite")
    ? `<b>⚡ Expedite incoming batch: ${title}</b>`
    : `<b>🔻 Reorder: ${title}</b>`;

  const lines: string[] = [];
  lines.push(header);
  lines.push("");
  lines.push("<b>Variants:</b>");
  for (const v of group.variants) {
    const variant = escapeHtml(v.variantTitle);
    const incoming =
      v.pipelineStock > 0 ? ` (+${v.pipelineStock} on order)` : "";
    const undated = v.undatedOnOrder > 0 ? ` ⚠ ${v.undatedOnOrder} no ETA` : "";
    const daysLeft = v.daysUntilStockout ?? "—";
    const stockoutStr = v.nextStockoutDate
      ? ` → stockout ${escapeHtml(v.nextStockoutDate)}`
      : "";
    let actionLine = "";
    if (v.recommendation === "expedite" && v.nextArrivalAfterStockout) {
      actionLine = `\n   ⚡ ${v.nextArrivalAfterStockout.qty}u batch arrives ${escapeHtml(v.nextArrivalAfterStockout.expectedDate)} (${v.nextArrivalAfterStockout.daysFromStockout}d late) — push to expedite`;
    } else if (v.recommendation === "reorder" && v.reorderStatus === "red") {
      actionLine = `\n   🔻 No incoming batch bridges the gap — place a new order (lead ${totalLead}d)`;
    } else if (v.recommendation === "set-eta") {
      actionLine = `\n   ⚠ ${v.undatedOnOrder} on order has no ETA — set the date in app`;
    }
    lines.push(
      `• <b>${variant}</b> — stock ${v.currentStock}${incoming}${undated}, avg ${v.avgDailySellRate.toFixed(1)}/day, ${daysLeft}d left${stockoutStr}` +
        actionLine +
        `\n   suggested order qty: <b>${v.moqSuggestedQty}</b>`
    );
  }
  lines.push("");
  lines.push(`<b>Total suggested order:</b> ${totalQty} units (MOQ ${group.moq})`);
  lines.push(`<b>Lead time:</b> ${totalLead} days`);

  const ts = new Date().toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  lines.push("");
  lines.push(`<i>StockDaddy · ${ts} UTC</i>`);

  const result = await sendTelegramMessage(lines.join("\n"));
  if (!result.ok) {
    console.error(`[StockDaddy] Telegram alert skipped: ${result.reason}`);
  }
  return result.ok;
}

export async function sendTestAlert(): Promise<SendResult> {
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
