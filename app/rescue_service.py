from decimal import Decimal, ROUND_DOWN

from app.logger import get_logger
from app.models import RescuePlan

logger = get_logger(__name__)


class RescueService:
    def build_rescue_plan(
        self,
        position: dict,
        balance: Decimal,
        available_balance: Decimal,
        target_avg: Decimal | None = None,
        max_extra_margin: Decimal | None = None,
        max_add_qty: Decimal | None = None,
    ) -> RescuePlan:
        symbol = str(position.get("symbol") or "")
        side = str(position.get("side") or "")
        qty = self._to_decimal(position.get("size"))
        avg_price = self._to_decimal(position.get("avgPrice"))
        mark_price = self._to_decimal(position.get("markPrice"))
        leverage = self._optional_decimal(position.get("leverage"))
        liquidation_price = self._optional_decimal(
            position.get("liqPrice") or position.get("liquidationPrice")
        )
        position_value = self._optional_decimal(position.get("positionValue"))

        if not symbol:
            raise ValueError("Position symbol is missing")
        if side not in {"Buy", "Sell"}:
            raise ValueError("Position side must be Buy or Sell")
        if qty <= 0:
            raise ValueError("Position size must be greater than zero")
        if avg_price <= 0 or mark_price <= 0:
            raise ValueError("Position prices must be greater than zero")
        if balance <= 0:
            raise ValueError("Balance must be greater than zero")

        unrealised_pnl = self.calculate_unrealised_pnl(
            side=side,
            qty=qty,
            avg_price=avg_price,
            mark_price=mark_price,
        )
        drawdown_percent = self.calculate_drawdown_percent(avg_price, mark_price)
        loss_to_balance_percent = abs(unrealised_pnl) / balance * Decimal("100")
        breakeven_price = avg_price
        distance_to_breakeven = self.calculate_distance_to_breakeven(
            side=side,
            avg_price=avg_price,
            mark_price=mark_price,
        )
        required_rebound_percent = (
            abs(distance_to_breakeven) / mark_price * Decimal("100")
        )

        warnings = self._build_warnings(
            leverage=leverage,
            loss_to_balance_percent=loss_to_balance_percent,
            drawdown_percent=drawdown_percent,
        )
        risk_score = self.calculate_risk_score(
            leverage=leverage,
            loss_to_balance_percent=loss_to_balance_percent,
            drawdown_percent=drawdown_percent,
            liquidation_price=liquidation_price,
            mark_price=mark_price,
            position_value=position_value,
            balance=balance,
        )
        risk_level = self.risk_level(risk_score)
        if risk_score >= 80:
            warnings.append("CRITICAL RISK: Do not average blindly. Reduce risk first.")

        conservative_scenario = self.build_conservative_scenario(
            qty=qty,
            unrealised_pnl=unrealised_pnl,
        )
        breakeven_scenario = self.build_breakeven_scenario(
            side=side,
            mark_price=mark_price,
            breakeven_price=breakeven_price,
        )
        averaging_scenario = self.build_averaging_scenario(
            side=side,
            qty=qty,
            avg_price=avg_price,
            mark_price=mark_price,
            leverage=leverage,
            available_balance=available_balance,
            max_extra_margin=max_extra_margin,
            max_add_qty=max_add_qty,
        )
        target_average_scenario = None
        if target_avg is not None:
            target_average_scenario = self.build_target_average_scenario(
                side=side,
                old_qty=qty,
                old_avg_price=avg_price,
                add_price=mark_price,
                target_avg_price=target_avg,
                available_balance=available_balance,
            )

        logger.info("Rescue plan created: symbol=%s risk=%s", symbol, risk_level)
        return RescuePlan(
            symbol=symbol,
            side=side,
            qty=qty,
            avg_price=avg_price,
            mark_price=mark_price,
            leverage=leverage,
            liquidation_price=liquidation_price,
            unrealised_pnl=unrealised_pnl,
            drawdown_percent=drawdown_percent,
            loss_to_balance_percent=loss_to_balance_percent,
            breakeven_price=breakeven_price,
            distance_to_breakeven=distance_to_breakeven,
            required_rebound_percent=required_rebound_percent,
            risk_score=risk_score,
            risk_level=risk_level,
            conservative_scenario=conservative_scenario,
            breakeven_scenario=breakeven_scenario,
            averaging_scenario=averaging_scenario,
            target_average_scenario=target_average_scenario,
            warnings=warnings,
        )

    def calculate_unrealised_pnl(
        self,
        side: str,
        qty: Decimal,
        avg_price: Decimal,
        mark_price: Decimal,
    ) -> Decimal:
        if side == "Buy":
            return (mark_price - avg_price) * qty
        if side == "Sell":
            return (avg_price - mark_price) * qty
        raise ValueError("side must be Buy or Sell")

    def calculate_drawdown_percent(
        self,
        avg_price: Decimal,
        mark_price: Decimal,
    ) -> Decimal:
        if avg_price <= 0:
            raise ValueError("avg_price must be greater than zero")
        return abs(mark_price - avg_price) / avg_price * Decimal("100")

    def calculate_distance_to_breakeven(
        self,
        side: str,
        avg_price: Decimal,
        mark_price: Decimal,
    ) -> Decimal:
        if side == "Buy":
            return avg_price - mark_price
        if side == "Sell":
            return mark_price - avg_price
        raise ValueError("side must be Buy or Sell")

    def calculate_new_average(
        self,
        old_qty: Decimal,
        old_avg_price: Decimal,
        add_qty: Decimal,
        add_price: Decimal,
    ) -> Decimal:
        if old_qty <= 0 or add_qty <= 0:
            raise ValueError("old_qty and add_qty must be greater than zero")
        return (old_qty * old_avg_price + add_qty * add_price) / (old_qty + add_qty)

    def calculate_add_qty_for_target_average(
        self,
        side: str,
        old_qty: Decimal,
        old_avg_price: Decimal,
        add_price: Decimal,
        target_avg_price: Decimal,
    ) -> Decimal:
        if side == "Buy":
            if target_avg_price <= add_price:
                raise ValueError("target average must be greater than add price")
            if target_avg_price >= old_avg_price:
                raise ValueError("target average must be below old average")
        elif side == "Sell":
            if target_avg_price >= add_price:
                raise ValueError("target average must be less than add price")
            if target_avg_price <= old_avg_price:
                raise ValueError("target average must be above old average")
        else:
            raise ValueError("side must be Buy or Sell")

        numerator = old_qty * (old_avg_price - target_avg_price)
        denominator = target_avg_price - add_price
        add_qty = numerator / denominator
        if add_qty <= 0:
            raise ValueError("target average requires non-positive add quantity")
        return add_qty

    def build_conservative_scenario(
        self,
        qty: Decimal,
        unrealised_pnl: Decimal,
    ) -> dict:
        close_25_qty = self._round_qty(qty * Decimal("0.25"))
        close_50_qty = self._round_qty(qty * Decimal("0.50"))
        return {
            "close_25_qty": close_25_qty,
            "realized_loss_25": unrealised_pnl * Decimal("0.25"),
            "remaining_qty_25": qty - close_25_qty,
            "risk_reduction_25_percent": Decimal("25"),
            "close_50_qty": close_50_qty,
            "realized_loss_50": unrealised_pnl * Decimal("0.50"),
            "remaining_qty_50": qty - close_50_qty,
            "risk_reduction_50_percent": Decimal("50"),
        }

    def build_breakeven_scenario(
        self,
        side: str,
        mark_price: Decimal,
        breakeven_price: Decimal,
    ) -> dict:
        distance = breakeven_price - mark_price
        multipliers = {
            "tp1": Decimal("0.25"),
            "tp2": Decimal("0.50"),
            "tp3": Decimal("0.75"),
            "tp4": Decimal("1"),
        }
        levels = {}
        for name, multiplier in multipliers.items():
            if side == "Buy":
                levels[name] = mark_price + distance * multiplier
            else:
                levels[name] = mark_price - abs(distance) * multiplier
        return {
            "breakeven_price": breakeven_price,
            "distance": abs(distance),
            "required_move_percent": abs(distance) / mark_price * Decimal("100"),
            "levels": levels,
        }

    def build_averaging_scenario(
        self,
        side: str,
        qty: Decimal,
        avg_price: Decimal,
        mark_price: Decimal,
        leverage: Decimal | None,
        available_balance: Decimal,
        max_extra_margin: Decimal | None = None,
        max_add_qty: Decimal | None = None,
    ) -> dict:
        variants = {
            "small_add_10_percent": Decimal("0.10"),
            "medium_add_25_percent": Decimal("0.25"),
            "large_add_50_percent": Decimal("0.50"),
        }
        result = {}
        for name, multiplier in variants.items():
            add_qty = self._round_qty(qty * multiplier)
            if max_add_qty is not None:
                add_qty = min(add_qty, max_add_qty)
            estimated_cost = add_qty * mark_price
            new_total_qty = qty + add_qty
            new_avg_price = self.calculate_new_average(
                old_qty=qty,
                old_avg_price=avg_price,
                add_qty=add_qty,
                add_price=mark_price,
            )
            required_rebound = self._required_rebound_percent(
                side=side,
                mark_price=mark_price,
                target_price=new_avg_price,
            )
            warnings = []
            if leverage is not None and leverage >= Decimal("50"):
                warnings.append("High leverage detected. Averaging is dangerous.")
            if estimated_cost > available_balance:
                warnings.append("Estimated cost is greater than available balance.")
            if max_extra_margin is not None and estimated_cost > max_extra_margin:
                warnings.append("Estimated cost is greater than max extra margin.")
            if new_total_qty >= qty * Decimal("1.5"):
                warnings.append("Position size increases by 50% or more.")
            result[name] = {
                "add_qty": add_qty,
                "estimated_cost": estimated_cost,
                "new_total_qty": new_total_qty,
                "new_avg_price": new_avg_price,
                "new_breakeven_price": new_avg_price,
                "required_rebound_percent": required_rebound,
                "warnings": warnings,
            }
        return result

    def build_target_average_scenario(
        self,
        side: str,
        old_qty: Decimal,
        old_avg_price: Decimal,
        add_price: Decimal,
        target_avg_price: Decimal,
        available_balance: Decimal,
    ) -> dict:
        try:
            add_qty = self.calculate_add_qty_for_target_average(
                side=side,
                old_qty=old_qty,
                old_avg_price=old_avg_price,
                add_price=add_price,
                target_avg_price=target_avg_price,
            )
        except ValueError as exc:
            return {"error": str(exc)}

        estimated_cost = add_qty * add_price
        warnings = []
        if estimated_cost > available_balance:
            warnings.append("Estimated cost is greater than available balance.")
        return {
            "target_avg_price": target_avg_price,
            "add_qty": add_qty,
            "estimated_cost": estimated_cost,
            "new_total_qty": old_qty + add_qty,
            "warnings": warnings,
        }

    def calculate_risk_score(
        self,
        leverage: Decimal | None,
        loss_to_balance_percent: Decimal,
        drawdown_percent: Decimal,
        liquidation_price: Decimal | None,
        mark_price: Decimal,
        position_value: Decimal | None,
        balance: Decimal,
    ) -> int:
        score = 0
        if leverage is not None and leverage >= Decimal("50"):
            score += 30
        if loss_to_balance_percent > Decimal("20"):
            score += 25
        if drawdown_percent > Decimal("10"):
            score += 20
        if liquidation_price is not None and liquidation_price > 0:
            liquidation_distance = (
                abs(mark_price - liquidation_price) / mark_price * Decimal("100")
            )
            if liquidation_distance < Decimal("5"):
                score += 25
        if position_value is not None and balance > 0:
            if position_value / balance > Decimal("2"):
                score += 15
        return min(score, 100)

    def risk_level(self, score: int) -> str:
        if score <= 30:
            return "low"
        if score <= 60:
            return "medium"
        if score <= 80:
            return "high"
        return "critical"

    def _build_warnings(
        self,
        leverage: Decimal | None,
        loss_to_balance_percent: Decimal,
        drawdown_percent: Decimal,
    ) -> list[str]:
        warnings = []
        if leverage is not None and leverage >= Decimal("50"):
            warnings.append(f"High leverage detected: {leverage}x")
            warnings.append("Averaging is dangerous at this leverage.")
        if loss_to_balance_percent > Decimal("20"):
            warnings.append(
                f"Loss is more than {loss_to_balance_percent:.2f}% of balance."
            )
        if drawdown_percent > Decimal("10"):
            warnings.append(f"Drawdown is high: {drawdown_percent:.2f}%.")
        return warnings

    def _required_rebound_percent(
        self,
        side: str,
        mark_price: Decimal,
        target_price: Decimal,
    ) -> Decimal:
        if side == "Buy":
            return (
                max(target_price - mark_price, Decimal("0"))
                / mark_price
                * Decimal("100")
            )
        return (
            max(mark_price - target_price, Decimal("0")) / mark_price * Decimal("100")
        )

    def _round_qty(self, qty: Decimal) -> Decimal:
        return qty.quantize(Decimal("0.001"), rounding=ROUND_DOWN)

    def _to_decimal(self, value: object) -> Decimal:
        if value in (None, ""):
            return Decimal("0")
        return Decimal(str(value))

    def _optional_decimal(self, value: object) -> Decimal | None:
        if value in (None, ""):
            return None
        return Decimal(str(value))
