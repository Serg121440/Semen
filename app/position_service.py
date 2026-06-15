from typing import Any

from app.bybit_client import ensure_success
from app.config import Settings
from app.logger import get_logger

logger = get_logger(__name__)


class PositionService:
    def __init__(self, session: Any, settings: Settings):
        self.session = session
        self.settings = settings

    def get_positions(self, category: str, symbol: str | None = None) -> dict:
        self.settings.require_private_credentials()
        params = {"category": category}
        if symbol:
            params["symbol"] = symbol
        logger.info("Fetching positions: category=%s symbol=%s", category, symbol)
        return ensure_success(self.session.get_positions(**params), "get_positions")

    def get_position_by_symbol(self, category: str, symbol: str) -> dict | None:
        response = self.get_positions(category=category, symbol=symbol)
        positions = response.get("result", {}).get("list", [])
        for position in positions:
            if position.get("symbol") == symbol:
                return position
        return None

    def set_leverage(
        self,
        category: str,
        symbol: str,
        buy_leverage: str,
        sell_leverage: str,
    ) -> dict:
        self.settings.require_private_credentials()
        logger.info("Setting leverage: category=%s symbol=%s", category, symbol)
        return ensure_success(
            self.session.set_leverage(
                category=category,
                symbol=symbol,
                buyLeverage=buy_leverage,
                sellLeverage=sell_leverage,
            ),
            "set_leverage",
        )

    def set_trading_stop(
        self,
        category: str,
        symbol: str,
        take_profit: str | None = None,
        stop_loss: str | None = None,
        trailing_stop: str | None = None,
    ) -> dict:
        self.settings.require_private_credentials()
        params = {"category": category, "symbol": symbol}
        if take_profit:
            params["takeProfit"] = take_profit
        if stop_loss:
            params["stopLoss"] = stop_loss
        if trailing_stop:
            params["trailingStop"] = trailing_stop
        logger.info("Setting trading stop: category=%s symbol=%s", category, symbol)
        return ensure_success(
            self.session.set_trading_stop(**params), "set_trading_stop"
        )
