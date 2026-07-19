from dataclasses import dataclass

from app.parser.base import DealCandidate


@dataclass(frozen=True, slots=True)
class ScoreResult:
    total: float
    discount_percent: float
    is_super_price: bool


def score_deal(deal: DealCandidate) -> ScoreResult:
    discount = 0.0
    if deal.market_price and deal.market_price > 0:
        discount = max(0.0, float((deal.market_price - deal.price) / deal.market_price * 100))
    price_score = min(40.0, discount * 1.25) if deal.market_price else 15.0
    flight_score = 20.0 if deal.stops == 0 else (12.0 if deal.stops == 1 else 2.0)
    if deal.travel_minutes and deal.travel_minutes > 600:
        flight_score *= 0.5
    hotel_score = min(15.0, max(0.0, ((deal.hotel_rating or 5.0) - 5) * 3.75))
    friday_score = 10.0 if deal.departure_date.weekday() == 4 else 4.0
    preference_score = deal.priority * 10 + deal.seasonal_fit * 5
    total = round(min(100.0, price_score + flight_score + hotel_score + friday_score + preference_score), 1)
    return ScoreResult(total=total, discount_percent=round(discount, 1), is_super_price=discount >= 30)
