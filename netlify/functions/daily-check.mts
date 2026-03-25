import type { Config } from "@netlify/functions";

export default async function handler() {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;

  if (!siteUrl) {
    console.error("No site URL available — cannot call /api/check");
    return new Response("No site URL", { status: 500 });
  }

  const checkUrl = `${siteUrl}/api/check?sync=true`;
  console.log(`[StockDaddy] Running daily check: ${checkUrl}`);

  try {
    const res = await fetch(checkUrl);
    const data = await res.json();

    console.log("[StockDaddy] Daily check result:", JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[StockDaddy] Daily check failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const config: Config = {
  schedule: "0 8 * * *", // Every day at 8:00 AM GMT
};
