import { NextRequest, NextResponse } from "next/server";

import { loadDashboard } from "@/lib/api";
import { dashboardToTradingState } from "@/lib/trading-state";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? "BTCUSDT";
  const side = request.nextUrl.searchParams.get("side") ?? undefined;

  try {
    const dashboard = await loadDashboard(symbol, side);
    return NextResponse.json(dashboardToTradingState(dashboard), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        source: {
          label: "FastAPI · переподключение",
          connected: false,
          mode: "api"
        },
        error: error instanceof Error ? error.message : "Failed to load state"
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
