import asyncio
import logging

import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from fastapi import FastAPI

from app.api.routes import router as api_router
from app.bot.handlers import build_router
from app.core.config import get_settings
from app.database.models import Base
from app.database.session import engine
from app.parser.demo import DemoSource
from app.parser.telegram import PublicTelegramSource
from app.services import ScanService
from app.scheduler import daily_scan

settings = get_settings()
api = FastAPI(title="Travel Deals Monitor", version="0.1.0")
api.include_router(api_router)


async def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sources = [DemoSource()] if settings.demo_source_enabled else []
    if settings.telegram_source_enabled and settings.telegram_channel_names:
        sources.append(PublicTelegramSource(
            settings.telegram_channel_names, timeout=settings.telegram_request_timeout,
        ))
    scanner = ScanService(sources)
    server = uvicorn.Server(uvicorn.Config(api, host=settings.api_host, port=settings.api_port, log_level="info"))
    tasks = [asyncio.create_task(server.serve())]
    if settings.bot_token:
        bot = Bot(settings.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        dispatcher = Dispatcher()
        dispatcher.include_router(build_router(scanner))
        scheduler = AsyncIOScheduler(timezone=settings.timezone)
        scheduler.add_job(
            daily_scan, "cron", hour=settings.daily_scan_hour, minute=0,
            args=[bot, scanner], id="daily-deal-scan", replace_existing=True,
        )
        scheduler.start()
        tasks.append(asyncio.create_task(dispatcher.start_polling(bot)))
    else:
        logging.warning("BOT_TOKEN is empty; API-only mode is running")
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(run())
