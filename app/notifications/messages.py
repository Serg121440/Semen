from app.database.models import Deal


def format_deal(deal: Deal) -> str:
    discount = 0
    if deal.market_price:
        discount = round((deal.market_price - deal.price) / deal.market_price * 100)
    heading = "🔥 <b>СУПЕРЦЕНА</b>" if deal.is_super_price else "✈️ <b>Выгодная поездка</b>"
    route = f"Москва → {deal.destination}"
    market = f"\nОбычно: {deal.market_price:,.0f} ₽\nЭкономия: {discount}%" if deal.market_price else ""
    dates = (
        "Даты: уточнить по ссылке"
        if deal.departure_date.year == 1970
        else f"Даты: {deal.departure_date:%d.%m}–{deal.return_date:%d.%m}"
    )
    return (
        f"{heading}\n\n<b>{deal.destination}</b>\n{route}\n\n"
        f"Цена: <b>{deal.price:,.0f} ₽ на двоих</b>{market}\n"
        f"{dates}\n"
        f"Travel Score: <b>{deal.score:.0f}/100</b>\n\n<a href=\"{deal.url}\">Открыть предложение</a>"
    ).replace(",", " ")
