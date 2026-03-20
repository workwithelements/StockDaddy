import type { SkuDashboardRow } from "./types";

export async function sendSlackAlert(row: SkuDashboardRow): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes("YOUR/WEBHOOK/URL")) {
    // Webhook not configured - alerts handled by scheduled task via Slack MCP
    console.log(`[StockDaddy] Alert for ${row.sku} (${row.productTitle}) - webhook not configured, skipping`);
    return true; // Return true so alert history is still tracked
  }

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Reorder Alert: ${row.productTitle}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*SKU:*\n${row.sku}` },
          {
            type: "mrkdwn",
            text: `*Current Stock:*\n${row.currentStock} units`,
          },
          {
            type: "mrkdwn",
            text: `*Avg Daily Sales:*\n${row.avgDailySellRate.toFixed(1)} units/day`,
          },
          {
            type: "mrkdwn",
            text: `*Days Until Stockout:*\n${row.daysUntilStockout ?? "N/A"} days`,
          },
          {
            type: "mrkdwn",
            text: `*Lead Time:*\n${row.leadTimeDays + row.deliveryTimeDays} days`,
          },
          {
            type: "mrkdwn",
            text: `*Suggested Reorder Qty:*\n${row.suggestedReorderQty} units`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `StockDaddy | ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("Slack alert failed:", err);
    return false;
  }
}
