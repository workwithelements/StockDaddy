import { NextRequest, NextResponse } from "next/server";
import { getAlertHistory, setAlertHistory } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const history = await getAlertHistory();
  return NextResponse.json(history);
}

export async function POST(request: NextRequest) {
  try {
    const { sku, action } = await request.json();

    if (!sku) {
      return NextResponse.json({ success: false, error: "SKU required" }, { status: 400 });
    }

    const history = await getAlertHistory();

    if (action === "dismiss") {
      if (history.alerts[sku]) {
        history.alerts[sku].dismissed = true;
        history.alerts[sku].dismissedAt = new Date().toISOString();
        await setAlertHistory(history);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "clear") {
      delete history.alerts[sku];
      await setAlertHistory(history);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Use 'dismiss' or 'clear'." },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
