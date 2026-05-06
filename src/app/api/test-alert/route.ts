import { NextResponse } from "next/server";
import { sendTestAlert } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const sent = await sendTestAlert();
  return NextResponse.json({ success: sent });
}
