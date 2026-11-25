import { NextResponse } from "next/server";
import { loadAccountSnapshot } from "@/lib/api";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    return NextResponse.json(await loadAccountSnapshot(), { headers });
  } catch {
    return NextResponse.json({ error: "Account data unavailable" }, { status: 502, headers });
  }
}
