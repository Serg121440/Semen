from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol


@dataclass(slots=True)
class SearchCriteria:
    departure_city: str = "Москва"
    adults: int = 2
    min_days: int = 3
    max_days: int = 4
    countries: tuple[str, ...] = ("Турция", "Сербия", "Черногория", "Армения", "Грузия", "Азербайджан")
    max_stops: int = 1
    max_travel_minutes: int = 600


@dataclass(slots=True)
class DealCandidate:
    source: str
    destination: str
    country: str
    departure_date: date
    return_date: date
    price: Decimal
    url: str
    market_price: Decimal | None = None
    airline: str | None = None
    stops: int = 0
    travel_minutes: int | None = None
    baggage: str | None = None
    hotel: str | None = None
    hotel_rating: float | None = None
    meal: str | None = None
    priority: float = 0.5
    seasonal_fit: float = 0.5


class DealSource(Protocol):
    name: str
    async def search(self, criteria: SearchCriteria) -> list[DealCandidate]: ...
