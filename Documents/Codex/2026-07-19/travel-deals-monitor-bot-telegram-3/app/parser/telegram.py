import asyncio
import logging
import re
from datetime import date, timedelta
from decimal import Decimal
from html.parser import HTMLParser
from typing import Any

from app.parser.base import DealCandidate, SearchCriteria

logger = logging.getLogger(__name__)

PRICE_RE = re.compile(r"(?P<price>\d[\d\s]{3,})\s*(?:₽|руб)", re.IGNORECASE)
DATE_RE = re.compile(r"(?<!\d)(?P<day>\d{1,2})[./](?P<month>\d{1,2})(?:[./](?P<year>\d{2,4}))?(?!\d)")
TOTAL_PRICE_RE = re.compile(r"(?:на|за)\s*(?:двоих|2\s*(?:чел|человек))", re.IGNORECASE)
KEYWORDS = ("горящ", "ошибка тарифа", "дешёв", "авиабилет", "билет", "тур", "перелёт", "перелет")
DESTINATIONS = {
    "стамбул": ("Стамбул", "Турция"), "анталья": ("Анталья", "Турция"),
    "белград": ("Белград", "Сербия"), "нови-сад": ("Нови-Сад", "Сербия"),
    "нови сад": ("Нови-Сад", "Сербия"), "ереван": ("Ереван", "Армения"),
    "тбилиси": ("Тбилиси", "Грузия"), "батуми": ("Батуми", "Грузия"),
    "баку": ("Баку", "Азербайджан"), "котор": ("Котор", "Черногория"),
    "будва": ("Будва", "Черногория"), "пераст": ("Пераст", "Черногория"),
    "черногория": ("Черногория", "Черногория"),
}


def _parse_date(match: re.Match[str], today: date) -> date | None:
    year_text = match.group("year")
    year = int(year_text) if year_text else today.year
    if year < 100:
        year += 2000
    try:
        result = date(year, int(match.group("month")), int(match.group("day")))
    except ValueError:
        return None
    if not year_text and result < today - timedelta(days=14):
        result = result.replace(year=year + 1)
    return result


def extract_message(text: str, *, today: date | None = None) -> dict[str, object] | None:
    """Extract a destination, price and optional dates from one channel message."""
    lowered = text.lower()
    price_match = PRICE_RE.search(text)
    destination = next((value for key, value in DESTINATIONS.items() if key in lowered), None)
    if not price_match or not destination or not any(keyword in lowered for keyword in KEYWORDS):
        return None
    observed_on = today or date.today()
    parsed_dates = [parsed for match in DATE_RE.finditer(text) if (parsed := _parse_date(match, observed_on))]
    departure_date = parsed_dates[0] if parsed_dates else None
    return_date = next((item for item in parsed_dates[1:] if departure_date and item > departure_date), None)
    if departure_date and not return_date:
        return_date = departure_date + timedelta(days=3)
    return {
        "destination": destination[0], "country": destination[1],
        "price": Decimal(price_match.group("price").replace(" ", "")),
        "price_is_total": bool(TOTAL_PRICE_RE.search(text)),
        "departure_date": departure_date, "return_date": return_date, "observed_on": observed_on,
    }


class _TelegramHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.current_post: str | None = None
        self.text_depth = 0
        self.buffer: list[str] = []
        self.messages: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        if "tgme_widget_message" in classes and attributes.get("data-post"):
            self.current_post = attributes["data-post"]
        if "tgme_widget_message_text" in classes and self.current_post:
            self.text_depth = 1
            self.buffer = []
        elif self.text_depth and tag not in {"br", "img", "meta", "link", "input"}:
            self.text_depth += 1
        if self.text_depth and tag == "br":
            self.buffer.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if not self.text_depth:
            return
        self.text_depth -= 1
        if self.text_depth == 0 and self.current_post:
            text = " ".join("".join(self.buffer).split())
            if text:
                self.messages.append((self.current_post, text))
            self.buffer = []

    def handle_data(self, data: str) -> None:
        if self.text_depth:
            self.buffer.append(data)


def parse_channel_html(html: str) -> list[tuple[str, str]]:
    parser = _TelegramHTMLParser()
    parser.feed(html)
    return parser.messages


class PublicTelegramSource:
    name = "telegram"

    def __init__(self, channels: tuple[str, ...], timeout: float = 15.0) -> None:
        self.channels = channels
        self.timeout = timeout

    async def _read_channel(self, client: Any, channel: str) -> list[tuple[str, str, str]]:
        import httpx

        try:
            response = await client.get(f"https://t.me/s/{channel}")
            response.raise_for_status()
        except (httpx.HTTPError, asyncio.TimeoutError):
            logger.warning("Telegram channel is unavailable: @%s", channel, exc_info=True)
            return []
        return [(channel, post, text) for post, text in parse_channel_html(response.text)]

    async def search(self, criteria: SearchCriteria) -> list[DealCandidate]:
        import httpx

        headers = {"User-Agent": "TravelDealsMonitor/0.1 (+Telegram public channel reader)"}
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True, headers=headers) as client:
            batches = await asyncio.gather(*(self._read_channel(client, item) for item in self.channels))
        deals: list[DealCandidate] = []
        allowed_countries = {item.casefold() for item in criteria.countries}
        for channel, post, text in (message for batch in batches for message in batch):
            payload = extract_message(text)
            if not payload or not payload["departure_date"] or not payload["return_date"]:
                continue
            if allowed_countries and str(payload["country"]).casefold() not in allowed_countries:
                continue
            price = payload["price"]
            if not payload["price_is_total"]:
                price *= criteria.adults
            deals.append(DealCandidate(
                source=f"telegram:{channel}", destination=str(payload["destination"]),
                country=str(payload["country"]), departure_date=payload["departure_date"],
                return_date=payload["return_date"], price=price, url=f"https://t.me/{post}",
                priority=0.8, seasonal_fit=0.6,
            ))
        return deals
