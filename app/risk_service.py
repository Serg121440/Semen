from decimal import Decimal

from app.logger import get_logger

logger = get_logger(__name__)


class RiskService:
    def calculate_position_size(
        self,
        balance: Decimal,
        risk_percent: Decimal,
        entry_price: Decimal,
        stop_loss_price: Decimal,
    ) -> Decimal:
        if balance <= 0:
            raise ValueError("balance must be greater than zero")
        if risk_percent <= 0:
            raise ValueError("risk_percent must be greater than zero")

        risk_amount = balance * risk_percent / Decimal("100")
        price_distance = abs(entry_price - stop_loss_price)
        if price_distance <= 0:
            raise ValueError("price distance must be greater than zero")

        position_size = risk_amount / price_distance
        logger.info(
            "Calculated position size: balance=%s risk_percent=%s size=%s",
            balance,
            risk_percent,
            position_size,
        )
        return position_size

    def calculate_stop_loss(
        self,
        entry_price: Decimal,
        side: str,
        stop_loss_percent: Decimal,
    ) -> Decimal:
        if entry_price <= 0:
            raise ValueError("entry_price must be greater than zero")
        if stop_loss_percent <= 0:
            raise ValueError("stop_loss_percent must be greater than zero")

        multiplier = stop_loss_percent / Decimal("100")
        if side == "Buy":
            stop_loss = entry_price * (Decimal("1") - multiplier)
        elif side == "Sell":
            stop_loss = entry_price * (Decimal("1") + multiplier)
        else:
            raise ValueError("side must be Buy or Sell")

        logger.info("Calculated stop-loss: side=%s stop_loss=%s", side, stop_loss)
        return stop_loss

    def calculate_take_profit_levels(
        self,
        entry_price: Decimal,
        side: str,
        risk_distance: Decimal,
    ) -> dict[str, Decimal]:
        if risk_distance <= 0:
            raise ValueError("risk_distance must be greater than zero")

        if side == "Buy":
            direction = Decimal("1")
        elif side == "Sell":
            direction = Decimal("-1")
        else:
            raise ValueError("side must be Buy or Sell")

        levels = {
            "conservative": entry_price + direction * risk_distance,
            "balanced": entry_price + direction * risk_distance * Decimal("2"),
            "aggressive": entry_price + direction * risk_distance * Decimal("3"),
        }
        logger.info("Calculated take-profit levels: %s", levels)
        return levels

    def calculate_leverage_for_target(
        self,
        balance: Decimal,
        target_profit: Decimal,
        entry_price: Decimal,
        take_profit_price: Decimal,
        position_size: Decimal,
    ) -> Decimal:
        if balance <= 0 or position_size <= 0:
            raise ValueError("balance and position_size must be greater than zero")
        price_move = abs(take_profit_price - entry_price)
        if price_move <= 0:
            raise ValueError("take profit must differ from entry price")

        expected_profit_without_leverage = price_move * position_size
        leverage = target_profit / expected_profit_without_leverage
        logger.info("Calculated target leverage: %s", leverage)
        return leverage
