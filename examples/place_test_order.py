from decimal import Decimal

from _bootstrap import build_services
from app.models import TradeSignal


def main() -> None:
    _, _, _, _, trade_planner = build_services()
    signal = TradeSignal(
        symbol="BTCUSDT",
        category="linear",
        side="Buy",
        entry_type="Market",
        risk_percent=Decimal("1"),
        stop_loss_percent=Decimal("1"),
        take_profit_mode="balanced",
    )
    result = trade_planner.execute_trade_signal(signal)
    plan = result.trade_plan

    print(f"status: {result.status}")
    print(f"symbol: {plan.symbol}")
    print(f"side: {plan.side}")
    print(f"entry price: {plan.entry_price}")
    print(f"stop-loss: {plan.stop_loss}")
    print(f"take-profit levels: {plan.take_profit_levels}")
    print(f"selected take-profit: {plan.selected_take_profit}")
    print(f"position size: {plan.position_size}")
    print(f"rounded qty: {plan.rounded_qty}")
    print(f"dry run: {plan.dry_run}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}")
