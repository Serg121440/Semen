import type {
  AccountSnapshot,
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

export async function loadAccountSnapshot(): Promise<AccountSnapshot> {
  const signal = AbortSignal.timeout(10_000);
  const [balance, positions] = await Promise.all([
    request<BalanceResponse>("/api/account/balance", { signal }),
    request<PositionsResponse>("/api/positions", { signal })
  ]);
  return { balance, positions, fetchedAt: Date.now() };
}

export async function loadDashboard(
  symbol = "BTCUSDT",
  side?: string
): Promise<DashboardData> {
  const [health, account] = await Promise.all([
    request<HealthResponse>("/api/health"),
    loadAccountSnapshot()
  ]);
  const { positions } = account;

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
          body: JSON.stringify({ side: selectedSide }),
          signal: AbortSignal.timeout(8_000)
        }).catch((error: unknown) => {
          console.warn("Dashboard analysis unavailable", error instanceof Error ? error.name : "UnknownError");
          return null;
        })
      : Promise.resolve(null)
  ]);
  const trend: TrendResponse | null = rescue?.trend ?? null;
  const marketAnalysis: MarketAnalysisResponse | null = rescue?.market_analysis ?? null;

  return {
    health,
    ...account,
    market,
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
