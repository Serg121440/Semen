from datetime import date
from decimal import Decimal

from app.parser.telegram import extract_message, parse_channel_html


def test_extracts_price_and_destination():
    result = extract_message("🔥 Горящий тур в Стамбул — всего 29 900 ₽ на двоих")
    assert result["destination"] == "Стамбул"
    assert result["price"] == Decimal("29900")


def test_ignores_irrelevant_message():
    assert extract_message("Доброе утро!") is None


def test_extracts_travel_dates():
    result = extract_message(
        "Дешёвые билеты в Белград 25.07–28.07 за 19 900 ₽", today=date(2026, 7, 19)
    )
    assert result["departure_date"] == date(2026, 7, 25)
    assert result["return_date"] == date(2026, 7, 28)


def test_parses_public_channel_html():
    html = """
    <div class="tgme_widget_message" data-post="travel/42">
      <div class="tgme_widget_message_text js-message_text">Дешёвые билеты<br>Стамбул 25.07 за 9 900 ₽</div>
    </div>
    """
    assert parse_channel_html(html) == [
        ("travel/42", "Дешёвые билеты Стамбул 25.07 за 9 900 ₽")
    ]
