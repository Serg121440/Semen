from datetime import date, timedelta
from decimal import Decimal

from app.parser.base import DealCandidate, SearchCriteria


class DemoSource:
    name = "demo"

    async def search(self, criteria: SearchCriteria) -> list[DealCandidate]:
        today = date.today()
        friday = today + timedelta(days=(4 - today.weekday()) % 7 or 7)
        return [
            DealCandidate(
                source=self.name, destination="Стамбул", country="Турция",
                departure_date=friday, return_date=friday + timedelta(days=3),
                price=Decimal("29900"), market_price=Decimal("45000"),
                airline="Demo Air", stops=0, travel_minutes=250, baggage="ручная кладь",
                hotel="City Demo Hotel", hotel_rating=8.7, meal="завтрак",
                url="https://example.com/deal", priority=1.0, seasonal_fit=0.8,
            )
        ]
