import logging
import os
from datetime import date
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

from src.config import LOGS_DIR, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID


class TelegramErrorHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
            return
        try:
            import requests
            text = f"🚨 *Ozon Supply ERROR*\n```\n{self.format(record)[:3000]}\n```"
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"},
                timeout=5,
            )
        except Exception:
            pass


def get_logger(name: str) -> logging.Logger:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / f"{date.today()}.log"

    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    fh = TimedRotatingFileHandler(log_file, when="midnight", backupCount=30, encoding="utf-8")
    fh.setFormatter(fmt)
    fh.setLevel(logging.DEBUG)

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    ch.setLevel(logging.INFO)

    tg = TelegramErrorHandler()
    tg.setFormatter(fmt)
    tg.setLevel(logging.ERROR)

    logger.addHandler(fh)
    logger.addHandler(ch)
    logger.addHandler(tg)
    return logger
