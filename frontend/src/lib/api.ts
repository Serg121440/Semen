import type {
  BalanceResponse,
  DashboardData,
  HealthResponse,
  MarketResponse,
  PositionsResponse,
  RescueResponse
} from "./types";

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

export async function loadDashboard(symbol = "BTCUSDT"): Promise<DashboardData> {
  const [health, balance, market, positions] = await Promise.all([
    request<HealthResponse>("/api/health"),
    request<BalanceResponse>("/api/account/balance"),
    request<MarketResponse>(`/api/market/${symbol}`),
    request<PositionsResponse>("/api/positions")
  ]);

  let rescue: RescueResponse | null = null;
  const active = positions.positions.find(
    (position) => position.symbol === symbol && Number(position.size) > 0
  );

  if (active) {
    rescue = await request<RescueResponse>(`/api/rescue/${symbol}`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  return { health, balance, market, positions, rescue };
}

export async function loadRescue(
  symbol = "BTCUSDT",
  targetAvg?: string
): Promise<RescueResponse> {
  return request<RescueResponse>(`/api/rescue/${symbol}`, {
    method: "POST",
    body: JSON.stringify({
      target_avg: targetAvg ? targetAvg : null
    })
  });
}
