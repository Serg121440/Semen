from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


class TradeSignal(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    symbol: str
    category: str = "linear"
    side: Literal["Buy", "Sell"]
    entry_type: Literal["Market", "Limit"]
    entry_price: Decimal | None = None
    risk_percent: Decimal = Decimal("1")
    stop_loss_percent: Decimal = Decimal("1")
    take_profit_mode: Literal[
        "conservative",
        "balanced",
        "aggressive",
    ] = "balanced"

    @field_validator("entry_price")
    @classmethod
    def validate_entry_price(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value <= 0:
            raise ValueError("entry_price must be greater than zero")
        return value

    @field_validator("risk_percent", "stop_loss_percent")
    @classmethod
    def validate_positive_decimal(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("value must be greater than zero")
        return value


class InstrumentRules(BaseModel):
    symbol: str
    tick_size: Decimal
    qty_step: Decimal
    min_order_qty: Decimal
    max_order_qty: Decimal | None = None
    min_notional_value: Decimal | None = None
    max_leverage: Decimal | None = None


class TradePlan(BaseModel):
    symbol: str
    category: str
    side: str
    entry_type: str
    entry_price: Decimal
    stop_loss: Decimal
    take_profit_levels: dict[str, Decimal]
    selected_take_profit: Decimal
    position_size: Decimal
    rounded_qty: Decimal
    leverage: Decimal | None = None
    dry_run: bool = True


class DryRunResult(BaseModel):
    status: str
    message: str
    trade_plan: TradePlan
    bybit_order_response: dict | None = None


class RescuePlan(BaseModel):
    symbol: str
    side: str
    qty: Decimal
    avg_price: Decimal
    mark_price: Decimal
    leverage: Decimal | None
    liquidation_price: Decimal | None
    unrealised_pnl: Decimal
    drawdown_percent: Decimal
    loss_to_balance_percent: Decimal
    breakeven_price: Decimal
    distance_to_breakeven: Decimal
    required_rebound_percent: Decimal
    risk_score: int
    risk_level: str
    conservative_scenario: dict
    breakeven_scenario: dict
    averaging_scenario: dict
    target_average_scenario: dict | None
    warnings: list[str]
