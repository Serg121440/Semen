import hashlib
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analyzer.scoring import score_deal
from app.database.models import Deal
from app.parser.base import DealSource, SearchCriteria

logger = logging.getLogger(__name__)


class ScanService:
    def __init__(self, sources: list[DealSource]):
        self.sources = sources

    async def scan(self, session: AsyncSession, criteria: SearchCriteria) -> list[Deal]:
        saved: list[Deal] = []
        for source in self.sources:
            candidates = await source.search(criteria)
            logger.info("Source %s returned %d candidates", source.name, len(candidates))
            for item in candidates:
                if item.stops > criteria.max_stops or (item.travel_minutes or 0) > criteria.max_travel_minutes:
                    continue
                identity = f"{item.source}|{item.destination}|{item.departure_date}|{item.return_date}|{item.price}"
                fingerprint = hashlib.sha256(identity.encode()).hexdigest()
                existing = await session.scalar(select(Deal).where(Deal.fingerprint == fingerprint))
                if existing:
                    saved.append(existing)
                    continue
                result = score_deal(item)
                deal = Deal(
                    fingerprint=fingerprint, score=result.total, is_super_price=result.is_super_price,
                    **{field: getattr(item, field) for field in (
                        "source", "destination", "country", "departure_date", "return_date", "price",
                        "market_price", "airline", "stops", "travel_minutes", "baggage", "hotel",
                        "hotel_rating", "meal", "url")},
                )
                session.add(deal)
                saved.append(deal)
        await session.commit()
        return saved
