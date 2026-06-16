"""Отправка уведомлений в Telegram."""
import requests
from src.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GOOGLE_SHEET_ID
from src.logger import get_logger

log = get_logger(__name__)

SHEET_URL = f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}"


def send_message(text: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        log.warning("Telegram not configured, skipping message")
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    resp = requests.post(url, json={
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }, timeout=10)
    resp.raise_for_status()
    log.info("Telegram message sent")


def send_weekly_summary(ship_date, clusters: int, boxes: int,
                        skus: int, critical: int) -> None:
    text = (
        f"📦 *План на отгрузку {ship_date.strftime('%d.%m.%Y')}*\n"
        f"• Кластеров: {clusters}\n"
        f"• Коробов: {boxes}\n"
        f"• SKU: {skus}\n"
        f"• Критичных (< 7 дней): {critical}\n\n"
        f"[Открыть таблицу →]({SHEET_URL})"
    )
    send_message(text)


def send_daily_alert(critical_items: list[dict]) -> None:
    if not critical_items:
        return
    lines = [f"⚠️ *Критичные остатки ({len(critical_items)} SKU)*\n"]
    for item in critical_items[:20]:
        lines.append(
            f"• {item['name']} / {item['cluster']}: "
            f"{item['days']:.1f} дн."
        )
    if len(critical_items) > 20:
        lines.append(f"...и ещё {len(critical_items) - 20}")
    send_message("\n".join(lines))
