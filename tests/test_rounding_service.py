from decimal import Decimal

import pytest

from app.rounding_service import RoundingService


def test_round_price_by_tick_size() -> None:
    service = RoundingService()

    assert service.round_price(Decimal("100.127"), Decimal("0.05")) == Decimal("100.1")


def test_round_qty_by_step() -> None:
    service = RoundingService()

    assert service.round_qty(Decimal("1.2345"), Decimal("0.001")) == Decimal("1.234")


def test_round_qty_rejects_zero_after_rounding() -> None:
    service = RoundingService()

    with pytest.raises(ValueError, match="zero"):
        service.round_qty(Decimal("0.0004"), Decimal("0.001"))


def test_min_validations() -> None:
    service = RoundingService()

    assert service.validate_min_qty(Decimal("0.01"), Decimal("0.01"))
    assert not service.validate_min_qty(Decimal("0.009"), Decimal("0.01"))
    assert service.validate_min_notional(Decimal("0.1"), Decimal("200"), Decimal("5"))
    assert not service.validate_min_notional(
        Decimal("0.01"), Decimal("200"), Decimal("5")
    )
