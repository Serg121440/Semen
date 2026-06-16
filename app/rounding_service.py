from decimal import Decimal, ROUND_DOWN

from app.logger import get_logger

logger = get_logger(__name__)


class RoundingService:
    def round_price(self, price: Decimal, tick_size: Decimal) -> Decimal:
        if tick_size <= 0:
            raise ValueError("tick_size must be greater than zero")
        rounded = (price / tick_size).to_integral_value(rounding=ROUND_DOWN) * tick_size
        logger.info(
            "Rounded price from %s to %s by tickSize=%s", price, rounded, tick_size
        )
        return rounded.normalize()

    def round_qty(self, qty: Decimal, qty_step: Decimal) -> Decimal:
        if qty_step <= 0:
            raise ValueError("qty_step must be greater than zero")
        rounded = (qty / qty_step).to_integral_value(rounding=ROUND_DOWN) * qty_step
        if rounded <= 0:
            raise ValueError("Rounded quantity is zero")
        logger.info("Rounded qty from %s to %s by qtyStep=%s", qty, rounded, qty_step)
        return rounded.normalize()

    def validate_min_qty(self, qty: Decimal, min_order_qty: Decimal) -> bool:
        valid = qty >= min_order_qty
        logger.info(
            "Min qty validation: qty=%s min=%s valid=%s", qty, min_order_qty, valid
        )
        return valid

    def validate_min_notional(
        self,
        qty: Decimal,
        price: Decimal,
        min_notional: Decimal,
    ) -> bool:
        notional = qty * price
        valid = notional >= min_notional
        logger.info(
            "Min notional validation: notional=%s min=%s valid=%s",
            notional,
            min_notional,
            valid,
        )
        return valid
