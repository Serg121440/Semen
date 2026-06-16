from typing import Any

from app.bybit_client import ensure_success
from app.config import Settings
from app.logger import get_logger

logger = get_logger(__name__)


class OrderConfirmationRequiredError(RuntimeError):
    pass


class OrderService:
    def __init__(self, session: Any, settings: Settings):
        self.session = session
        self.settings = settings

    def place_market_order(
        self,
        category: str,
        symbol: str,
        side: str,
        qty: str,
        take_profit: str | None = None,
        stop_loss: str | None = None,
        reduce_only: bool = False,
        confirm: bool = False,
    ) -> dict:
        return self._place_order(
            category=category,
            symbol=symbol,
            side=side,
            order_type="Market",
            qty=qty,
            take_profit=take_profit,
            stop_loss=stop_loss,
            reduce_only=reduce_only,
            confirm=confirm,
        )

    def place_limit_order(
        self,
        category: str,
        symbol: str,
        side: str,
        qty: str,
        price: str,
        take_profit: str | None = None,
        stop_loss: str | None = None,
        reduce_only: bool = False,
        confirm: bool = False,
    ) -> dict:
        return self._place_order(
            category=category,
            symbol=symbol,
            side=side,
            order_type="Limit",
            qty=qty,
            price=price,
            take_profit=take_profit,
            stop_loss=stop_loss,
            reduce_only=reduce_only,
            confirm=confirm,
        )

    def cancel_order(
        self,
        category: str,
        symbol: str,
        order_id: str,
        confirm: bool = False,
    ) -> dict:
        self._require_confirmation(confirm, "cancel_order")
        self.settings.require_private_credentials()
        logger.info(
            "Cancelling order: category=%s symbol=%s order_id=%s",
            category,
            symbol,
            order_id,
        )
        return ensure_success(
            self.session.cancel_order(
                category=category, symbol=symbol, orderId=order_id
            ),
            "cancel_order",
        )

    def amend_order(
        self,
        category: str,
        symbol: str,
        order_id: str,
        qty: str | None = None,
        price: str | None = None,
        take_profit: str | None = None,
        stop_loss: str | None = None,
    ) -> dict:
        self.settings.require_private_credentials()
        params = {"category": category, "symbol": symbol, "orderId": order_id}
        if qty:
            params["qty"] = qty
        if price:
            params["price"] = price
        if take_profit:
            params["takeProfit"] = take_profit
        if stop_loss:
            params["stopLoss"] = stop_loss
        logger.info(
            "Amending order: category=%s symbol=%s order_id=%s",
            category,
            symbol,
            order_id,
        )
        return ensure_success(self.session.amend_order(**params), "amend_order")

    def get_open_orders(self, category: str, symbol: str | None = None) -> dict:
        self.settings.require_private_credentials()
        params = {"category": category}
        if symbol:
            params["symbol"] = symbol
        logger.info("Fetching open orders: category=%s symbol=%s", category, symbol)
        return ensure_success(self.session.get_open_orders(**params), "get_open_orders")

    def get_order_history(self, category: str, symbol: str | None = None) -> dict:
        self.settings.require_private_credentials()
        params = {"category": category}
        if symbol:
            params["symbol"] = symbol
        logger.info("Fetching order history: category=%s symbol=%s", category, symbol)
        return ensure_success(
            self.session.get_order_history(**params), "get_order_history"
        )

    def _place_order(
        self,
        category: str,
        symbol: str,
        side: str,
        order_type: str,
        qty: str,
        price: str | None = None,
        take_profit: str | None = None,
        stop_loss: str | None = None,
        reduce_only: bool = False,
        confirm: bool = False,
    ) -> dict:
        if side not in {"Buy", "Sell"}:
            raise ValueError("side must be Buy or Sell")

        params: dict[str, Any] = {
            "category": category,
            "symbol": symbol,
            "side": side,
            "orderType": order_type,
            "qty": qty,
            "reduceOnly": reduce_only,
        }
        if price:
            params["price"] = price
        if take_profit:
            params["takeProfit"] = take_profit
        if stop_loss:
            params["stopLoss"] = stop_loss

        logger.info(
            "Preparing %s order: category=%s symbol=%s side=%s qty=%s",
            order_type,
            category,
            symbol,
            side,
            qty,
        )
        if self.settings.dry_run:
            logger.info("DRY_RUN enabled: order was not sent")
            return {
                "retCode": 0,
                "retMsg": "DRY_RUN: order was not sent",
                "result": {"request": params},
            }

        self._require_confirmation(confirm, "place_order")
        self.settings.require_private_credentials()
        logger.warning("DRY_RUN disabled: sending order to Bybit")
        return ensure_success(self.session.place_order(**params), "place_order")

    def _require_confirmation(self, confirmed: bool, operation: str) -> None:
        if self.settings.require_order_confirmation and not confirmed:
            logger.warning(
                "%s blocked: explicit user confirmation is required", operation
            )
            raise OrderConfirmationRequiredError(
                f"{operation} requires explicit user confirmation"
            )
