import type { DashboardData, Position } from "./types";

export type TradingCorePosition = {
  sym: string;
  side: "Buy" | "Sell";
  size: number;
  entry: number;
  liq: number | null;
  tp: number | null;
};

export type TradingCoreState = {
  wallet: number;
  equity: number;
  marks: Record<string, number>;
  positions: TradingCorePosition[];
  levels: Array<Record<string, unknown>>;
  heatmap: Array<Record<string, unknown>>;
  scenarios: Record<string, unknown>;
  source: {
    label: string;
    connected: boolean;
    mode: "api";
  };
};

type LoosePosition = Partial<Position> & {
  sym?: string;
  qty?: string | number;
  contracts?: string | number;
  entry?: string | number;
  entryPrice?: string | number;
  liq?: string | number | null;
  tp?: string | number | null;
};

export function normalizeTradingPosition(position: LoosePosition): TradingCorePosition | null {
  const symbol = position.sym ?? position.symbol;
  if (!symbol) return null;

  const rawSize = finiteNumber(position.size ?? position.qty ?? position.contracts) ?? 0;
  const side =
    position.side === "Buy" || position.side === "Sell"
      ? position.side
      : rawSize < 0
        ? "Sell"
        : "Buy";

  return {
    sym: symbol,
    side,
    size: Math.abs(rawSize),
    entry: finiteNumber(position.entry ?? position.avgPrice ?? position.entryPrice) ?? 0,
    liq: finiteNumber(position.liq ?? position.liqPrice ?? position.liquidationPrice),
    tp: finiteNumber(position.tp ?? position.takeProfit)
  };
}

export function dashboardToTradingState(data: DashboardData): TradingCoreState {
  const positions = data.positions.positions
    .filter((position) => Number(position.size) > 0)
    .map(normalizeTradingPosition)
    .filter((position): position is TradingCorePosition => position !== null);
  const marks = positions.reduce<Record<string, number>>((acc, position) => {
    const source = data.positions.positions.find(
      (item) => item.symbol === position.sym && item.side === position.side
    );
    const mark = finiteNumber(source?.markPrice);
    if (mark !== null) acc[position.sym] = mark;
    return acc;
  }, {});
  const marketPrice = finiteNumber(data.market.current_price);
  if (marketPrice !== null) marks[data.market.symbol] = marketPrice;

  const intervals = data.marketAnalysis?.intervals ?? {};
  const activeInterval = intervals["240"] ?? intervals["60"] ?? intervals["15"] ?? intervals.D;
  const levels = activeInterval
    ? [
        { price: activeInterval.resistance, label: "сопротивление", kind: "resistance" },
        { price: activeInterval.ema20, label: "EMA20", kind: "ema" },
        { price: activeInterval.ema50, label: "EMA50", kind: "ema" },
        { price: activeInterval.support, label: "поддержка", kind: "support" }
      ]
    : [];

  return {
    wallet: finiteNumber(data.balance.wallet_balance) ?? 0,
    equity: finiteNumber(data.balance.equity) ?? 0,
    marks,
    positions,
    levels,
    heatmap: data.marketAnalysis?.liquidity_map.zones ?? [],
    scenarios: {
      consensus: data.marketAnalysis?.consensus ?? null,
      intervals,
      rescue: data.rescue?.rescue_plan ?? null
    },
    source: {
      label: "FastAPI · Bybit",
      connected: true,
      mode: "api"
    }
  };
}

function finiteNumber(value: string | number | null | undefined): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
