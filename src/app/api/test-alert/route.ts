import { NextResponse } from "next/server";
import { sendTestAlert } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await sendTestAlert();
  return NextResponse.json(
    { success: result.ok, ...(result.reason && { reason: result.reason }) },
    { status: result.ok ? 200 : 500 }
  );
}
