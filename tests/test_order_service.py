import pytest

from app.config import Settings
from app.order_service import OrderConfirmationRequiredError, OrderService


class FakeSession:
    def __init__(self) -> None:
        self.place_order_called = False
        self.cancel_order_called = False

    def place_order(self, **kwargs):
        self.place_order_called = True
        return {"retCode": 0, "result": kwargs}

    def cancel_order(self, **kwargs):
        self.cancel_order_called = True
        return {"retCode": 0, "result": kwargs}


def test_place_order_requires_confirmation_when_dry_run_is_disabled() -> None:
    session = FakeSession()
    service = OrderService(
        session=session,
        settings=Settings(
            api_key="key",
            api_secret="secret",
            dry_run=False,
            require_order_confirmation=True,
        ),
    )

    with pytest.raises(OrderConfirmationRequiredError):
        service.place_market_order(
            category="linear",
            symbol="BTCUSDT",
            side="Buy",
            qty="0.001",
        )

    assert session.place_order_called is False


def test_place_order_sends_after_confirmation() -> None:
    session = FakeSession()
    service = OrderService(
        session=session,
        settings=Settings(
            api_key="key",
            api_secret="secret",
            dry_run=False,
            require_order_confirmation=True,
        ),
    )

    response = service.place_market_order(
        category="linear",
        symbol="BTCUSDT",
        side="Buy",
        qty="0.001",
        confirm=True,
    )

    assert response["retCode"] == 0
    assert session.place_order_called is True


def test_cancel_order_requires_confirmation() -> None:
    session = FakeSession()
    service = OrderService(
        session=session,
        settings=Settings(
            api_key="key",
            api_secret="secret",
            dry_run=False,
            require_order_confirmation=True,
        ),
    )

    with pytest.raises(OrderConfirmationRequiredError):
        service.cancel_order(
            category="linear",
            symbol="BTCUSDT",
            order_id="123",
        )

    assert session.cancel_order_called is False
