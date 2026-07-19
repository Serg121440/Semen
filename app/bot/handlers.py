from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy import desc, select

from app.database.models import Deal, User
from app.database.session import SessionFactory
from app.notifications.messages import format_deal
from app.parser.base import SearchCriteria
from app.services import ScanService


def build_router(scanner: ScanService) -> Router:
    router = Router()

    @router.message(Command("start"))
    async def start(message: Message) -> None:
        async with SessionFactory() as session:
            user = await session.scalar(select(User).where(User.telegram_id == message.from_user.id))
            if not user:
                session.add(User(telegram_id=message.from_user.id))
                await session.commit()
        await message.answer("Привет! Я ищу выгодные поездки на 3–4 дня. Запустите /scan или откройте /settings.")

    @router.message(Command("scan"))
    async def scan(message: Message) -> None:
        await message.answer("Ищу лучшие варианты…")
        async with SessionFactory() as session:
            deals = await scanner.scan(session, SearchCriteria())
            if not deals:
                await message.answer("Новых подходящих предложений пока нет.")
            for deal in sorted(deals, key=lambda x: x.score, reverse=True)[:5]:
                await message.answer(format_deal(deal), disable_web_page_preview=True)

    @router.message(Command("settings"))
    async def settings(message: Message) -> None:
        await message.answer("Текущие настройки: Москва, 2 взрослых, 3–4 дня, до 1 пересадки, только безвизовые направления. Веб-редактирование доступно через API /docs.")

    @router.message(Command("countries"))
    async def countries(message: Message) -> None:
        await message.answer("Приоритет: Турция, Сербия, Черногория, Армения, Грузия, Азербайджан.")

    @router.message(Command("history"))
    async def history(message: Message) -> None:
        async with SessionFactory() as session:
            deals = (await session.scalars(select(Deal).order_by(desc(Deal.found_at)).limit(10))).all()
        await message.answer("\n".join(f"{d.destination}: {d.price:,.0f} ₽ · {d.score:.0f}/100" for d in deals).replace(",", " ") or "История пуста.")

    @router.message(Command("favorites"))
    async def favorites(message: Message) -> None:
        await message.answer("Избранное появится здесь после сохранения предложения.")

    @router.message(Command("help"))
    async def help_command(message: Message) -> None:
        await message.answer("/scan — поиск\n/settings — настройки\n/countries — страны\n/history — история\n/favorites — избранное")

    @router.message(F.text)
    async def fallback(message: Message) -> None:
        await message.answer("Не понял команду. Используйте /help.")
    return router
