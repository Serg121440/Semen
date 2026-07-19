from decimal import Decimal

from app.parser.telegram import extract_message


def test_extracts_price_and_destination():
    result = extract_message("🔥 Горящий тур в Стамбул — всего 29 900 ₽ на двоих")
    assert result["destination"] == "Стамбул"
    assert result["price"] == Decimal("29900")


def test_ignores_irrelevant_message():
    assert extract_message("Доброе утро!") is None
