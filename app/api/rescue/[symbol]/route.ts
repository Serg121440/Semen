import { NextRequest, NextResponse } from "next/server";

import { backendBase, backendHeaders } from "@/lib/backend";

type RouteContext = {
  params: Promise<{ symbol: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { symbol } = await context.params;
  const body = await request.text();

  const response = await fetch(`${backendBase()}/api/rescue/${symbol}`, {
    method: "POST",
    headers: backendHeaders(),
    body: body || "{}",
    cache: "no-store"
  });

  const payload = await response.text();
  return new NextResponse(payload, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json"
    }
  });
}
