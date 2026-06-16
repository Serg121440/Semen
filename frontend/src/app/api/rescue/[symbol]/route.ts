import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_TOKEN = process.env.BACKEND_API_TOKEN;

type RouteContext = {
  params: Promise<{ symbol: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { symbol } = await context.params;
  const body = await request.text();

  const response = await fetch(`${API_BASE}/api/rescue/${symbol}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {})
    },
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
