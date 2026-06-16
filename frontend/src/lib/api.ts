import type {
  BalanceResponse,
  DashboardData,
  HealthResponse,
  MarketResponse,
  PositionsResponse,
  RescueResponse,
  TrendResponse
} from "./types";
import "./tls";

const API_BASE = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_TOKEN = process.env.BACKEND_API_TOKEN;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function loadDashboard(
  symbol = "BTCUSDT",
  side?: string
): Promise<DashboardData> {
  const [health, balance, positions] = await Promise.all([
    request<HealthResponse>("/api/health"),
    request<BalanceResponse>("/api/account/balance"),
    request<PositionsResponse>("/api/positions")
  ]);

  const activePositions = positions.positions.filter((position) => Number(position.size) > 0);
  const selectedPosition =
    activePositions.find(
      (position) => position.symbol === symbol && (!side || position.side === side)
    ) ??
    activePositions[0] ??
    null;
  const selectedSymbol = selectedPosition?.symbol ?? symbol;
  const selectedSide = selectedPosition?.side;
  const market = await request<MarketResponse>(`/api/market/${selectedSymbol}`);
  let rescue: RescueResponse | null = null;
  let trend: TrendResponse | null = null;

  if (selectedPosition) {
    rescue = await request<RescueResponse>(`/api/rescue/${selectedSymbol}`, {
      method: "POST",
      body: JSON.stringify({ side: selectedSide })
    });
    trend = rescue.trend;
  }

  return { health, balance, market, positions, rescue, selectedPosition, trend };
}

export async function loadRescue(
  symbol = "BTCUSDT",
  targetAvg?: string,
  side?: string
): Promise<RescueResponse> {
  return request<RescueResponse>(`/api/rescue/${symbol}`, {
    method: "POST",
    body: JSON.stringify({
      side: side || null,
      target_avg: targetAvg ? targetAvg : null
    })
  });
}
