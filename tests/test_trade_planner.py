from decimal import Decimal

from app.config import Settings
from app.models import InstrumentRules, TradeSignal
from app.trade_planner import TradePlanner


class FakeMarketService:
    def get_last_price(self, category: str, symbol: str) -> Decimal:
        return Decimal("100")

    def get_instrument_rules(self, category: str, symbol: str) -> InstrumentRules:
        return InstrumentRules(
            symbol=symbol,
            tick_size=Decimal("0.1"),
            qty_step=Decimal("0.001"),
            min_order_qty=Decimal("0.001"),
            min_notional_value=Decimal("5"),
            max_leverage=Decimal("100"),
        )


class FakeAccountService:
    def get_available_balance(
        self, coin: str = "USDT", account_type: str = "UNIFIED"
    ) -> Decimal:
        return Decimal("1000")


class FakeOrderService:
    def __init__(self) -> None:
        self.sent = False

    def place_market_order(self, **kwargs):
        self.sent = True
        return {"retCode": 0, "result": kwargs}


def test_build_trade_plan_for_market_buy() -> None:
    settings = Settings(api_key=None, api_secret=None, dry_run=True)
    order_service = FakeOrderService()
    planner = TradePlanner(
        settings=settings,
        market_service=FakeMarketService(),
        account_service=FakeAccountService(),
        order_service=order_service,
    )

    plan = planner.build_trade_plan(
        TradeSignal(symbol="BTCUSDT", side="Buy", entry_type="Market")
    )

    assert plan.entry_price == Decimal("100")
    assert plan.stop_loss == Decimal("99")
    assert plan.selected_take_profit == Decimal("102")
    assert plan.rounded_qty == Decimal("10")
    assert plan.dry_run is True


def test_execute_trade_signal_dry_run_does_not_send_order() -> None:
    settings = Settings(api_key=None, api_secret=None, dry_run=True)
    order_service = FakeOrderService()
    planner = TradePlanner(
        settings=settings,
        market_service=FakeMarketService(),
        account_service=FakeAccountService(),
        order_service=order_service,
    )

    result = planner.execute_trade_signal(
        TradeSignal(symbol="BTCUSDT", side="Buy", entry_type="Market")
    )

    assert result.status == "dry_run"
    assert order_service.sent is False
    assert result.bybit_order_response is None
