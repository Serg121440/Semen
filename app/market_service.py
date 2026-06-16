from decimal import Decimal
from typing import Any

from app.bybit_client import ensure_success
from app.logger import get_logger
from app.models import InstrumentRules

logger = get_logger(__name__)


class MarketService:
    def __init__(self, session: Any):
        self.session = session

    def get_instruments_info(self, category: str, symbol: str | None = None) -> dict:
        params = {"category": category}
        if symbol:
            params["symbol"] = symbol
        logger.info(
            "Fetching instruments info: category=%s symbol=%s", category, symbol
        )
        return ensure_success(
            self.session.get_instruments_info(**params), "get_instruments_info"
        )

    def get_ticker(self, category: str, symbol: str) -> dict:
        logger.info("Fetching ticker: category=%s symbol=%s", category, symbol)
        return ensure_success(
            self.session.get_tickers(category=category, symbol=symbol),
            "get_ticker",
        )

    def get_kline(
        self,
        category: str,
        symbol: str,
        interval: str = "15",
        limit: int = 200,
    ) -> dict:
        logger.info(
            "Fetching kline: category=%s symbol=%s interval=%s",
            category,
            symbol,
            interval,
        )
        return ensure_success(
            self.session.get_kline(
                category=category,
                symbol=symbol,
                interval=interval,
                limit=limit,
            ),
            "get_kline",
        )

    def get_orderbook(self, category: str, symbol: str, limit: int = 50) -> dict:
        logger.info(
            "Fetching orderbook: category=%s symbol=%s limit=%s",
            category,
            symbol,
            limit,
        )
        return ensure_success(
            self.session.get_orderbook(category=category, symbol=symbol, limit=limit),
            "get_orderbook",
        )

    def get_open_interest(
        self,
        category: str,
        symbol: str,
        interval_time: str = "15min",
        limit: int = 50,
    ) -> dict:
        logger.info(
            "Fetching open interest: category=%s symbol=%s interval=%s",
            category,
            symbol,
            interval_time,
        )
        return ensure_success(
            self.session.get_open_interest(
                category=category,
                symbol=symbol,
                intervalTime=interval_time,
                limit=limit,
            ),
            "get_open_interest",
        )

    def get_instrument_rules(self, category: str, symbol: str) -> InstrumentRules:
        response = self.get_instruments_info(category=category, symbol=symbol)
        instruments = response.get("result", {}).get("list", [])
        if not instruments:
            raise ValueError(f"Instrument rules not found for {category}:{symbol}")

        instrument = instruments[0]
        lot_filter = instrument.get("lotSizeFilter", {})
        price_filter = instrument.get("priceFilter", {})
        leverage_filter = instrument.get("leverageFilter", {})

        rules = InstrumentRules(
            symbol=instrument["symbol"],
            tick_size=Decimal(str(price_filter["tickSize"])),
            qty_step=Decimal(str(lot_filter["qtyStep"])),
            min_order_qty=Decimal(str(lot_filter["minOrderQty"])),
            max_order_qty=(
                Decimal(str(lot_filter.get("maxOrderQty")))
                if lot_filter.get("maxOrderQty") is not None
                else None
            ),
            min_notional_value=Decimal(str(lot_filter.get("minNotionalValue", "0"))),
            max_leverage=(
                Decimal(str(leverage_filter.get("maxLeverage")))
                if leverage_filter.get("maxLeverage") is not None
                else None
            ),
        )
        logger.info("Fetched instrument rules: %s", rules.model_dump())
        return rules

    def get_last_price(self, category: str, symbol: str) -> Decimal:
        response = self.get_ticker(category=category, symbol=symbol)
        tickers = response.get("result", {}).get("list", [])
        if not tickers:
            raise ValueError(f"Ticker not found for {category}:{symbol}")
        price = tickers[0].get("lastPrice")
        if price is None:
            raise ValueError(f"lastPrice missing for {category}:{symbol}")
        return Decimal(str(price))
