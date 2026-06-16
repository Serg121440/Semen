from decimal import Decimal

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.models import InstrumentRules, TradePlan  # noqa: E402
from app.web_api import api, get_services, require_api_auth  # noqa: E402


class FakeAccountService:
    def get_coin_balance(self, coin: str = "USDT", account_type: str = "UNIFIED"):
        return {
            "result": {
                "list": [
                    {
                        "coin": [
                            {
                                "coin": coin,
                                "walletBalance": "1000",
                                "equity": "1000",
                                "availableToWithdraw": "900",
                            }
                        ]
                    }
                ]
            }
        }


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


class FakePositionService:
    def get_positions(self, category: str, symbol: str | None = None):
        return {"result": {"list": [self.get_position_by_symbol(category, "BTCUSDT")]}}

    def get_position_by_symbol(self, category: str, symbol: str):
        return {
            "symbol": symbol,
            "side": "Buy",
            "size": "1",
            "avgPrice": "100",
            "markPrice": "90",
            "leverage": "100",
            "liqPrice": "80",
            "positionValue": "90",
            "unrealisedPnl": "-10",
        }


class FakeTradePlanner:
    def build_trade_plan(self, signal):
        return TradePlan(
            symbol=signal.symbol,
            category=signal.category,
            side=signal.side,
            entry_type=signal.entry_type,
            entry_price=Decimal("100"),
            stop_loss=Decimal("99"),
            take_profit_levels={
                "conservative": Decimal("101"),
                "balanced": Decimal("102"),
                "aggressive": Decimal("103"),
            },
            selected_take_profit=Decimal("102"),
            position_size=Decimal("1"),
            rounded_qty=Decimal("1"),
            dry_run=True,
        )


class FakeRescueService:
    def build_rescue_plan(self, **kwargs):
        from app.rescue_service import RescueService

        return RescueService().build_rescue_plan(**kwargs)


class FakeServices:
    def __init__(self):
        self.settings = Settings(api_key="key", api_secret="secret", dry_run=True)
        self.account_service = FakeAccountService()
        self.market_service = FakeMarketService()
        self.position_service = FakePositionService()
        self.trade_planner = FakeTradePlanner()
        self.rescue_service = FakeRescueService()


@pytest.fixture()
def client():
    api.dependency_overrides[get_services] = lambda: FakeServices()
    api.dependency_overrides[require_api_auth] = lambda: None
    with TestClient(api) as test_client:
        yield test_client
    api.dependency_overrides.clear()


def test_health_endpoint(client) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["dry_run"] is True
    assert response.json()["live_trading"] is False


def test_balance_endpoint(client) -> None:
    response = client.get("/api/account/balance")

    assert response.status_code == 200
    assert response.json()["available_balance"] == "900"


def test_market_endpoint(client) -> None:
    response = client.get("/api/market/BTCUSDT")

    assert response.status_code == 200
    assert response.json()["symbol"] == "BTCUSDT"
    assert response.json()["current_price"] == "100"


def test_positions_endpoint(client) -> None:
    response = client.get("/api/positions")

    assert response.status_code == 200
    assert response.json()["positions"][0]["symbol"] == "BTCUSDT"


def test_trade_plan_endpoint_is_dry_run(client) -> None:
    response = client.post(
        "/api/trade/plan",
        json={"symbol": "BTCUSDT", "side": "Buy"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "dry_run"


def test_rescue_endpoint_is_calculation_only(client) -> None:
    response = client.post("/api/rescue/BTCUSDT", json={})

    assert response.status_code == 200
    assert response.json()["status"] == "calculation_only"
    assert response.json()["rescue_plan"]["risk_score"] >= 30
