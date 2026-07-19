import logging

from aiogram import Bot
from sqlalchemy import select

from app.database.models import DealDelivery, User
from app.database.session import SessionFactory
from app.notifications.messages import format_deal
from app.parser.base import SearchCriteria
from app.services import ScanService

logger = logging.getLogger(__name__)


async def daily_scan(bot: Bot, scanner: ScanService) -> None:
    """Runs one personalized scan and delivers up to five new deals per enabled user."""
    async with SessionFactory() as session:
        users = (await session.scalars(select(User).where(User.enabled.is_(True)))).all()
        for user in users:
            criteria = SearchCriteria(
                departure_city=user.departure_city,
                adults=user.adults,
                min_days=user.min_days,
                max_days=user.max_days,
                countries=tuple(filter(None, map(str.strip, user.countries.split(",")))),
                max_stops=user.max_stops,
                max_travel_minutes=user.max_travel_minutes,
            )
            try:
                deals = await scanner.scan(session, criteria)
                for deal in sorted(deals, key=lambda item: item.score, reverse=True)[:5]:
                    delivered = await session.scalar(
                        select(DealDelivery.id).where(
                            DealDelivery.user_id == user.id, DealDelivery.deal_id == deal.id
                        )
                    )
                    if delivered:
                        continue
                    await bot.send_message(user.telegram_id, format_deal(deal), disable_web_page_preview=True)
                    session.add(DealDelivery(user_id=user.id, deal_id=deal.id))
                    await session.commit()
            except Exception:
                logger.exception("Scheduled scan failed for user id=%s", user.id)
