import re
from datetime import date
from decimal import Decimal

PRICE_RE = re.compile(r"(?P<price>\d[\d\s]{3,})\s*(?:₽|руб)", re.IGNORECASE)
DESTINATIONS = {"стамбул": ("Стамбул", "Турция"), "белград": ("Белград", "Сербия"), "ереван": ("Ереван", "Армения"), "черногория": ("Черногория", "Черногория")}


def extract_message(text: str) -> dict[str, object] | None:
    """Extracts a minimal candidate payload from a channel message."""
    price_match = PRICE_RE.search(text)
    destination = next((value for key, value in DESTINATIONS.items() if key in text.lower()), None)
    if not price_match or not destination:
        return None
    return {
        "destination": destination[0], "country": destination[1],
        "price": Decimal(price_match.group("price").replace(" ", "")), "observed_on": date.today(),
    }
