export type RiskLevel = "low" | "medium" | "high" | "critical";

export type HealthResponse = {
  status: string;
  dry_run: boolean;
  testnet: boolean;
  live_trading: boolean;
};

export type BalanceResponse = {
  account_type: string;
  coin: string;
  wallet_balance: string | null;
  equity: string | null;
  available_balance: string;
};

export type MarketResponse = {
  symbol: string;
  category: string;
  current_price: string;
  rules: {
    symbol: string;
    tick_size: string;
    qty_step: string;
    min_order_qty: string;
    max_order_qty: string | null;
    min_notional_value: string | null;
    max_leverage: string | null;
  };
};

export type Position = {
  symbol: string;
  side: "Buy" | "Sell" | "";
  size: string;
  avgPrice: string;
  markPrice: string;
  liqPrice?: string;
  liquidationPrice?: string;
  leverage: string;
  unrealisedPnl: string;
  takeProfit?: string;
  stopLoss?: string;
  positionValue?: string;
};

export type PositionsResponse = {
  category: string;
  positions: Position[];
};

export type RescuePlan = {
  symbol: string;
  side: string;
  qty: string;
  avg_price: string;
  mark_price: string;
  leverage: string | null;
  liquidation_price: string | null;
  unrealised_pnl: string;
  drawdown_percent: string;
  loss_to_balance_percent: string;
  breakeven_price: string;
  distance_to_breakeven: string;
  required_rebound_percent: string;
  risk_score: number;
  risk_level: RiskLevel;
  conservative_scenario: {
    close_25_qty: string;
    realized_loss_25: string;
    remaining_qty_25: string;
    close_50_qty: string;
    realized_loss_50: string;
    remaining_qty_50: string;
  };
  breakeven_scenario: {
    levels: Record<string, string>;
  };
  averaging_scenario: Record<
    string,
    {
      add_qty: string;
      estimated_cost: string;
      new_total_qty: string;
      new_avg_price: string;
      required_rebound_percent: string;
      warnings: string[];
    }
  >;
  target_average_scenario: Record<string, unknown> | null;
  warnings: string[];
};

export type RescueResponse = {
  status: string;
  message: string;
  rescue_plan: RescuePlan;
};

export type DashboardData = {
  health: HealthResponse;
  balance: BalanceResponse;
  market: MarketResponse;
  positions: PositionsResponse;
  rescue: RescueResponse | null;
};
