from app.account_service import AccountService
from app.config import Settings
from app.logger import get_logger
from app.market_service import MarketService
from app.models import DryRunResult, TradePlan, TradeSignal
from app.order_service import OrderService
from app.risk_service import RiskService
from app.rounding_service import RoundingService

logger = get_logger(__name__)


class TradePlanner:
    def __init__(
        self,
        settings: Settings,
        market_service: MarketService,
        account_service: AccountService,
        order_service: OrderService,
        risk_service: RiskService | None = None,
        rounding_service: RoundingService | None = None,
    ):
        self.settings = settings
        self.market_service = market_service
        self.account_service = account_service
        self.order_service = order_service
        self.risk_service = risk_service or RiskService()
        self.rounding_service = rounding_service or RoundingService()

    def build_trade_plan(self, signal: TradeSignal) -> TradePlan:
        logger.info(
            "Building trade plan: symbol=%s side=%s", signal.symbol, signal.side
        )
        balance = self.account_service.get_available_balance(
            coin="USDT",
            account_type=self.settings.account_type,
        )

        if signal.entry_type == "Market":
            entry_price = self.market_service.get_last_price(
                signal.category, signal.symbol
            )
        elif signal.entry_type == "Limit":
            if signal.entry_price is None:
                raise ValueError("entry_price is required for Limit entry")
            entry_price = signal.entry_price
        else:
            raise ValueError("entry_type must be Market or Limit")

        stop_loss = self.risk_service.calculate_stop_loss(
            entry_price=entry_price,
            side=signal.side,
            stop_loss_percent=signal.stop_loss_percent,
        )
        risk_distance = abs(entry_price - stop_loss)
        position_size = self.risk_service.calculate_position_size(
            balance=balance,
            risk_percent=signal.risk_percent,
            entry_price=entry_price,
            stop_loss_price=stop_loss,
        )
        take_profit_levels = self.risk_service.calculate_take_profit_levels(
            entry_price=entry_price,
            side=signal.side,
            risk_distance=risk_distance,
        )

        rules = self.market_service.get_instrument_rules(signal.category, signal.symbol)

        rounded_entry = self.rounding_service.round_price(entry_price, rules.tick_size)
        rounded_stop_loss = self.rounding_service.round_price(
            stop_loss, rules.tick_size
        )
        rounded_take_profit_levels = {
            name: self.rounding_service.round_price(value, rules.tick_size)
            for name, value in take_profit_levels.items()
        }
        selected_take_profit = rounded_take_profit_levels[signal.take_profit_mode]
        rounded_qty = self.rounding_service.round_qty(position_size, rules.qty_step)

        if not self.rounding_service.validate_min_qty(rounded_qty, rules.min_order_qty):
            raise ValueError(
                f"Quantity {rounded_qty} is less than minOrderQty {rules.min_order_qty}"
            )
        if (
            rules.min_notional_value
            and not self.rounding_service.validate_min_notional(
                rounded_qty,
                rounded_entry,
                rules.min_notional_value,
            )
        ):
            raise ValueError(
                f"Order notional {rounded_qty * rounded_entry} is less than "
                f"minNotionalValue {rules.min_notional_value}"
            )

        plan = TradePlan(
            symbol=signal.symbol,
            category=signal.category,
            side=signal.side,
            entry_type=signal.entry_type,
            entry_price=rounded_entry,
            stop_loss=rounded_stop_loss,
            take_profit_levels=rounded_take_profit_levels,
            selected_take_profit=selected_take_profit,
            position_size=position_size,
            rounded_qty=rounded_qty,
            leverage=None,
            dry_run=self.settings.dry_run,
        )
        logger.info(
            "Trade plan created: symbol=%s qty=%s dry_run=%s",
            plan.symbol,
            plan.rounded_qty,
            plan.dry_run,
        )
        return plan

    def execute_trade_signal(
        self,
        signal: TradeSignal,
        confirm_order: bool = False,
    ) -> DryRunResult:
        plan = self.build_trade_plan(signal)
        if self.settings.dry_run:
            logger.info("DRY_RUN enabled: returning calculated plan only")
            return DryRunResult(
                status="dry_run",
                message="DRY_RUN=true: order was not sent",
                trade_plan=plan,
                bybit_order_response=None,
            )

        logger.warning("DRY_RUN=false: order sending is enabled")
        common_kwargs = {
            "category": plan.category,
            "symbol": plan.symbol,
            "side": plan.side,
            "qty": str(plan.rounded_qty),
            "take_profit": str(plan.selected_take_profit),
            "stop_loss": str(plan.stop_loss),
        }
        if plan.entry_type == "Market":
            response = self.order_service.place_market_order(
                **common_kwargs,
                confirm=confirm_order,
            )
        else:
            response = self.order_service.place_limit_order(
                **common_kwargs,
                price=str(plan.entry_price),
                confirm=confirm_order,
            )

        return DryRunResult(
            status="order_sent",
            message="Order sent to Bybit",
            trade_plan=plan,
            bybit_order_response=response,
        )
