from decimal import Decimal

import pytest

from app.risk_service import RiskService


def test_calculate_position_size() -> None:
    service = RiskService()

    result = service.calculate_position_size(
        balance=Decimal("1000"),
        risk_percent=Decimal("1"),
        entry_price=Decimal("100"),
        stop_loss_price=Decimal("95"),
    )

    assert result == Decimal("2")


def test_calculate_position_size_rejects_zero_distance() -> None:
    service = RiskService()

    with pytest.raises(ValueError, match="price distance"):
        service.calculate_position_size(
            balance=Decimal("1000"),
            risk_percent=Decimal("1"),
            entry_price=Decimal("100"),
            stop_loss_price=Decimal("100"),
        )


def test_calculate_stop_loss_for_buy_and_sell() -> None:
    service = RiskService()

    assert service.calculate_stop_loss(
        Decimal("100"),
        "Buy",
        Decimal("1"),
    ) == Decimal("99.00")
    assert service.calculate_stop_loss(
        Decimal("100"),
        "Sell",
        Decimal("1"),
    ) == Decimal("101.00")


def test_calculate_take_profit_levels_for_buy() -> None:
    service = RiskService()

    levels = service.calculate_take_profit_levels(
        entry_price=Decimal("100"),
        side="Buy",
        risk_distance=Decimal("5"),
    )

    assert levels == {
        "conservative": Decimal("105"),
        "balanced": Decimal("110"),
        "aggressive": Decimal("115"),
    }
