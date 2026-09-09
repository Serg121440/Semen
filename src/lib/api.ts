import type {
  BalanceResponse,
  DashboardData,
  HealthResponse,
  MarketResponse,
  PositionsResponse,
  RescueResponse,
  MarketAnalysisResponse,
  TrendResponse
} from "./types";
import { backendBase, backendHeaders } from "./backend";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBase()}${path}`, {
    ...init,
    cache: "no-store",
    headers: backendHeaders(init?.headers)
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
  const [market, rescue] = await Promise.all([
    request<MarketResponse>(`/api/market/${selectedSymbol}`),
    selectedPosition
      ? request<RescueResponse>(`/api/rescue/${selectedSymbol}`, {
          method: "POST",
          body: JSON.stringify({ side: selectedSide })
        })
      : Promise.resolve(null)
  ]);
  const trend: TrendResponse | null = rescue?.trend ?? null;
  const marketAnalysis: MarketAnalysisResponse | null = rescue?.market_analysis ?? null;

  return {
    health,
    balance,
    market,
    positions,
    rescue,
    selectedPosition,
    trend,
    marketAnalysis
  };
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
