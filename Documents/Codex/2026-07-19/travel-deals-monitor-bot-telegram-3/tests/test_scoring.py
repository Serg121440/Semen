from datetime import date
from decimal import Decimal

from app.analyzer.scoring import score_deal
from app.parser.base import DealCandidate


def candidate(**changes):
    values = dict(source="test", destination="Стамбул", country="Турция", departure_date=date(2026, 7, 24), return_date=date(2026, 7, 27), price=Decimal("29900"), market_price=Decimal("45000"), url="https://example.com", stops=0, travel_minutes=240, hotel_rating=8.5, priority=1.0, seasonal_fit=0.8)
    values.update(changes)
    return DealCandidate(**values)


def test_super_price_and_score():
    result = score_deal(candidate())
    assert result.is_super_price is True
    assert result.discount_percent > 30
    assert 80 <= result.total <= 100


def test_connections_reduce_score():
    assert score_deal(candidate(stops=2)).total < score_deal(candidate(stops=0)).total
