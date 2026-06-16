from decimal import Decimal

from app.rescue_service import RescueService


def _position(side: str = "Buy") -> dict:
    return {
        "symbol": "BTCUSDT",
        "side": side,
        "size": "0.1",
        "avgPrice": "100",
        "markPrice": "90" if side == "Buy" else "110",
        "leverage": "100",
        "liqPrice": "86",
        "positionValue": "9000",
        "unrealisedPnl": "-1",
    }


def test_unrealised_pnl_for_long() -> None:
    service = RescueService()

    assert service.calculate_unrealised_pnl(
        side="Buy",
        qty=Decimal("0.1"),
        avg_price=Decimal("100"),
        mark_price=Decimal("90"),
    ) == Decimal("-1.0")


def test_unrealised_pnl_for_short() -> None:
    service = RescueService()

    assert service.calculate_unrealised_pnl(
        side="Sell",
        qty=Decimal("0.1"),
        avg_price=Decimal("100"),
        mark_price=Decimal("110"),
    ) == Decimal("-1.0")


def test_drawdown_and_loss_to_balance() -> None:
    service = RescueService()

    plan = service.build_rescue_plan(
        position=_position(),
        balance=Decimal("10"),
        available_balance=Decimal("5"),
    )

    assert plan.drawdown_percent == Decimal("10.0")
    assert plan.loss_to_balance_percent == Decimal("10.00")


def test_breakeven_and_required_rebound() -> None:
    service = RescueService()

    plan = service.build_rescue_plan(
        position=_position(),
        balance=Decimal("100"),
        available_balance=Decimal("50"),
    )

    assert plan.breakeven_price == Decimal("100")
    assert plan.distance_to_breakeven == Decimal("10")
    assert plan.required_rebound_percent == Decimal("11.11111111111111111111111111")


def test_partial_close_scenarios() -> None:
    service = RescueService()

    scenario = service.build_conservative_scenario(
        qty=Decimal("0.1"),
        unrealised_pnl=Decimal("-10"),
    )

    assert scenario["close_25_qty"] == Decimal("0.025")
    assert scenario["realized_loss_25"] == Decimal("-2.50")
    assert scenario["close_50_qty"] == Decimal("0.050")
    assert scenario["realized_loss_50"] == Decimal("-5.0")


def test_new_average_after_averaging() -> None:
    service = RescueService()

    result = service.calculate_new_average(
        old_qty=Decimal("1"),
        old_avg_price=Decimal("100"),
        add_qty=Decimal("1"),
        add_price=Decimal("80"),
    )

    assert result == Decimal("90")


def test_add_qty_for_target_average() -> None:
    service = RescueService()

    result = service.calculate_add_qty_for_target_average(
        side="Buy",
        old_qty=Decimal("1"),
        old_avg_price=Decimal("100"),
        add_price=Decimal("80"),
        target_avg_price=Decimal("90"),
    )

    assert result == Decimal("1")


def test_risk_score_and_high_leverage_warning() -> None:
    service = RescueService()

    plan = service.build_rescue_plan(
        position=_position(),
        balance=Decimal("10"),
        available_balance=Decimal("5"),
    )

    assert plan.risk_score >= 45
    assert any("High leverage" in warning for warning in plan.warnings)
