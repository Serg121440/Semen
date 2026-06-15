from decimal import Decimal

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from app.account_service import AccountService
from app.bybit_client import BybitClient
from app.config import Settings, load_settings
from app.market_service import MarketService
from app.models import RescuePlan, TradePlan, TradeSignal
from app.order_service import OrderService
from app.position_service import PositionService
from app.rescue_service import RescueService
from app.trade_planner import TradePlanner

app = typer.Typer(help="Bybit Trading Core CLI")
console = Console()


class ServiceContainer:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.session = BybitClient(settings).get_http_session()
        self.market_service = MarketService(self.session)
        self.account_service = AccountService(self.session, settings)
        self.position_service = PositionService(self.session, settings)
        self.order_service = OrderService(self.session, settings)
        self.trade_planner = TradePlanner(
            settings=settings,
            market_service=self.market_service,
            account_service=self.account_service,
            order_service=self.order_service,
        )
        self.rescue_service = RescueService()


def build_services() -> ServiceContainer:
    return ServiceContainer(load_settings())


@app.command()
def menu() -> None:
    """Show the main terminal navigation menu."""
    table = Table(title="Bybit Trading Core")
    table.add_column("#", justify="right")
    table.add_column("Section")
    table.add_column("Command")
    table.add_column("Status")
    sections = (
        ("1", "Dashboard", "python main.py dashboard BTCUSDT", "ready"),
        ("2", "Positions", "python main.py positions", "ready"),
        ("3", "Rescue Mode", "python main.py rescue BTCUSDT", "ready"),
        (
            "4",
            "Trade Planner",
            "python main.py plan --side Buy --risk 0.5 --sl 1",
            "ready",
        ),
        ("5", "Orders", "python main.py orders", "read-only"),
        ("6", "Risk Monitor", "python main.py risk-monitor", "preview"),
        ("7", "Journal", "python main.py journal", "preview"),
        ("8", "Settings", "python main.py settings", "ready"),
    )
    for number, section, command, status in sections:
        table.add_row(number, section, command, status)
    console.print(table)


@app.command()
def dashboard(
    symbol: str = typer.Argument("BTCUSDT"),
    category: str = typer.Option("linear", "--category", "-c"),
) -> None:
    """Show the main risk dashboard for account, market, position and rescue mode."""
    try:
        services = build_services()
        price = services.market_service.get_last_price(category, symbol)
        position = services.position_service.get_position_by_symbol(category, symbol)
        if not position or Decimal(str(position.get("size") or "0")) <= 0:
            console.print(
                Panel(f"No active position found for {symbol}", title="Dashboard")
            )
            return

        balance_response = services.account_service.get_coin_balance(
            coin="USDT",
            account_type=services.settings.account_type,
        )
        coin_balance = _extract_coin_balance(balance_response, "USDT")
        balance_value = Decimal(
            str(
                coin_balance.get("walletBalance")
                or coin_balance.get("equity")
                or coin_balance.get("availableToWithdraw")
                or "0"
            )
        )
        available_balance = Decimal(str(_available_balance_value(coin_balance)))
        plan = services.rescue_service.build_rescue_plan(
            position=position,
            balance=balance_value,
            available_balance=available_balance,
        )

        _print_dashboard(
            settings=services.settings,
            symbol=symbol,
            category=category,
            price=price,
            coin_balance=coin_balance,
            plan=plan,
        )
    except Exception as exc:
        _print_error(exc)
        raise typer.Exit(1) from exc


@app.command()
def market(
    symbol: str = typer.Argument("BTCUSDT"),
    category: str = typer.Option("linear", "--category", "-c"),
) -> None:
    """Show market info and instrument rules."""
    try:
        services = build_services()
        price = services.market_service.get_last_price(category, symbol)
        rules = services.market_service.get_instrument_rules(category, symbol)

        table = Table(title=f"{symbol} Market Info")
        table.add_column("Field")
        table.add_column("Value")
        table.add_row("category", category)
        table.add_row("current price", str(price))
        table.add_row("tickSize", str(rules.tick_size))
        table.add_row("qtyStep", str(rules.qty_step))
        table.add_row("minOrderQty", str(rules.min_order_qty))
        table.add_row("maxLeverage", str(rules.max_leverage))
        table.add_row("minNotionalValue", str(rules.min_notional_value))
        console.print(table)
    except Exception as exc:
        _print_error(exc)
        raise typer.Exit(1) from exc


@app.command()
def balance() -> None:
    """Show USDT account balance."""
    try:
        services = build_services()
        response = services.account_service.get_coin_balance(
            coin="USDT",
            account_type=services.settings.account_type,
        )
        data = _extract_coin_balance(response, "USDT")

        table = Table(title="Account Balance")
        table.add_column("Field")
        table.add_column("Value")
        table.add_row("account", services.settings.account_type)
        table.add_row("coin", "USDT")
        table.add_row("walletBalance", data.get("walletBalance", "-"))
        table.add_row("equity", data.get("equity", "-"))
        table.add_row("available", _available_balance_value(data))
        console.print(table)
    except Exception as exc:
        _print_error(exc)
        raise typer.Exit(1) from exc


@app.command()
def positions(
    category: str = typer.Option("linear", "--category", "-c"),
    symbol: str | None = typer.Option(None, "--symbol", "-s"),
) -> None:
    """Show current positions."""
    try:
        services = build_services()
        response = services.position_service.get_positions(category, symbol)
        items = response.get("result", {}).get("list", [])
        if not items:
            console.print(Panel("No positions found", title="Positions"))
            return

        table = Table(title="Current Positions")
        for column in (
            "symbol",
            "side",
            "size",
            "entry",
            "mark",
            "lev",
            "liq",
            "uPnL",
            "TP",
            "SL",
        ):
            table.add_column(column)

        for item in items:
            if Decimal(str(item.get("size") or "0")) <= 0:
                continue
            leverage = Decimal(str(item.get("leverage") or "0"))
            pnl = Decimal(str(item.get("unrealisedPnl") or "0"))
            table.add_row(
                str(item.get("symbol", "")),
                str(item.get("side", "")),
                str(item.get("size", "")),
                str(item.get("avgPrice", "")),
                str(item.get("markPrice", "")),
                str(item.get("leverage", "")),
                str(item.get("liqPrice") or item.get("liquidationPrice") or ""),
                f"[red]{pnl}[/red]" if pnl < 0 else str(pnl),
                str(item.get("takeProfit", "")),
                str(item.get("stopLoss", "")),
            )
            if leverage >= Decimal("50"):
                console.print(
                    f"[bold red]WARNING: High leverage detected: {leverage}x[/bold red]"
                )

        console.print(table)
    except Exception as exc:
        _print_error(exc)
        raise typer.Exit(1) from exc


@app.command()
def plan(
    symbol: str = typer.Option("BTCUSDT", "--symbol", "-s"),
    category: str = typer.Option("linear", "--category", "-c"),
    side: str = typer.Option(..., "--side"),
    entry_type: str = typer.Option("Market", "--entry-type"),
    entry_price: Decimal | None = typer.Option(None, "--entry-price"),
    risk: Decimal = typer.Option(Decimal("1"), "--risk"),
    sl: Decimal = typer.Option(Decimal("1"), "--sl"),
    tp: str = typer.Option(
        "balanced",
        "--tp",
    ),
    send: bool = typer.Option(False, "--send"),
) -> None:
    """Build a trade plan. Orders stay blocked by DRY_RUN and CLI guards."""
    try:
        side = _validate_choice(side, "side", {"Buy", "Sell"})
        entry_type = _validate_choice(entry_type, "entry-type", {"Market", "Limit"})
        tp = _validate_choice(
            tp,
            "tp",
            {"conservative", "balanced", "aggressive"},
        )
        if risk > Decimal("2"):
            console.print(
                "[bold red]Risk greater than 2% is blocked in CLI. "
                "Lower --risk before planning.[/bold red]"
            )
            raise typer.Exit(1)

        services = build_services()
        signal = TradeSignal(
            symbol=symbol,
            category=category,
            side=side,
            entry_type=entry_type,
            entry_price=entry_price,
            risk_percent=risk,
            stop_loss_percent=sl,
            take_profit_mode=tp,
        )

        if send:
            if services.settings.dry_run:
                result = services.trade_planner.execute_trade_signal(signal)
                _print_trade_plan(result.trade_plan, result.status, result.message)
                console.print(
                    "[yellow]DRY_RUN is enabled. Order was not sent.[/yellow]"
                )
                return
            if not services.settings.testnet:
                console.print(
                    "[bold red]Live trading is disabled in this CLI version. "
                    "Use Bybit Testnet only.[/bold red]"
                )
                raise typer.Exit(1)
            result = services.trade_planner.execute_trade_signal(
                signal,
                confirm_order=True,
            )
            _print_trade_plan(result.trade_plan, result.status, result.message)
            return

        trade_plan = services.trade_planner.build_trade_plan(signal)
        _print_trade_plan(
            trade_plan,
            "dry_run" if services.settings.dry_run else "planned",
            "Ордер не отправлен. Это только расчет торгового плана.",
        )
    except typer.Exit:
        raise
    except Exception as exc:
        _print_error(exc)
        raise typer.Exit(1) from exc


@app.command()
def rescue(
    symbol: str = typer.Argument("BTCUSDT"),
    category: str = typer.Option("linear", "--category", "-c"),
    max_extra_margin: Decimal | None = typer.Option(None, "--max-extra-margin"),
    max_add_qty: Decimal | None = typer.Option(None, "--max-add-qty"),
    target_exit: Decimal | None = typer.Option(None, "--target-exit"),
    target_avg: Decimal | None = typer.Option(None, "--target-avg"),
    mode: str = typer.Option(
        "conservative",
        "--mode",
    ),
    send: bool = typer.Option(False, "--send"),
) -> None:
    """Build a calculation-only rescue plan for an existing position."""
    try:
        mode = _validate_choice(
            mode,
            "mode",
            {"conservative", "balanced", "aggressive"},
        )
        if send:
            console.print(
                "[yellow]Rescue Mode is calculation-only in this version. "
                "No orders were sent.[/yellow]"
            )

        services = build_services()
        position = services.position_service.get_position_by_symbol(category, symbol)
        if not position or Decimal(str(position.get("size") or "0")) <= 0:
            console.print(
                Panel(f"No active position found for {symbol}", title="Rescue")
            )
            return

        balance_response = services.account_service.get_coin_balance(
            coin="USDT",
            account_type=services.settings.account_type,
        )
        coin_balance = _extract_coin_balance(balance_response, "USDT")
        balance_value = Decimal(
            str(
                coin_balance.get("walletBalance")
                or coin_balance.get("equity")
                or coin_balance.get("availableToWithdraw")
                or "0"
            )
        )
        available_balance = Decimal(str(_available_balance_value(coin_balance)))
        services.market_service.get_instrument_rules(category, symbol)

        plan = services.rescue_service.build_rescue_plan(
            position=position,
            balance=balance_value,
            available_balance=available_balance,
            target_avg=target_avg or target_exit,
            max_extra_margin=max_extra_margin,
            max_add_qty=max_add_qty,
        )
        _print_rescue_plan(plan, mode)
    except Exception as exc:
        _print_error(exc)
        raise typer.Exit(1) from exc


@app.command()
def orders(
    category: str = typer.Option("linear", "--category", "-c"),
    symbol: str | None = typer.Option(None, "--symbol", "-s"),
) -> None:
    """Show open orders. This command is read-only."""
    try:
        services = build_services()
        response = services.order_service.get_open_orders(
            category=category,
            symbol=symbol,
        )
        orders_list = response.get("result", {}).get("list", [])
        if not orders_list:
            console.print(Panel("No open orders found", title="Orders"))
            return

        table = Table(title="Open Orders")
        for column in ("symbol", "side", "type", "qty", "price", "TP", "SL", "status"):
            table.add_column(column)
        for item in orders_list:
            table.add_row(
                str(item.get("symbol", "")),
                str(item.get("side", "")),
                str(item.get("orderType", "")),
                str(item.get("qty", "")),
                str(item.get("price", "")),
                str(item.get("takeProfit", "")),
                str(item.get("stopLoss", "")),
                str(item.get("orderStatus", "")),
            )
        console.print(table)
    except Exception as exc:
        _print_error(exc)
        raise typer.Exit(1) from exc


@app.command("risk-monitor")
def risk_monitor() -> None:
    """Show the future risk monitor section."""
    console.print(
        Panel(
            "Risk Monitor preview:\n"
            "- liquidation distance alerts\n"
            "- leverage warnings\n"
            "- drawdown thresholds\n"
            "- rescue score tracking\n\n"
            "No background monitoring is started in this MVP.",
            title="Risk Monitor",
        )
    )


@app.command()
def journal() -> None:
    """Show the future journal section."""
    console.print(
        Panel(
            "Journal preview:\n"
            "- planned trades\n"
            "- rescue plans\n"
            "- decisions and notes\n"
            "- no automatic order history writes yet",
            title="Journal",
        )
    )


@app.command()
def settings() -> None:
    """Show safe runtime settings without secrets."""
    try:
        current = load_settings()
        table = Table(title="Settings")
        table.add_column("Key")
        table.add_column("Value")
        table.add_row("BYBIT_TESTNET", str(current.testnet))
        table.add_row("DRY_RUN", str(current.dry_run))
        table.add_row(
            "REQUIRE_ORDER_CONFIRMATION",
            str(current.require_order_confirmation),
        )
        table.add_row("BYBIT_ACCOUNT_TYPE", current.account_type)
        table.add_row("DEFAULT_CATEGORY", current.default_category)
        table.add_row("DEFAULT_SYMBOL", current.default_symbol)
        table.add_row("API key present", str(bool(current.api_key)))
        table.add_row("API secret present", str(bool(current.api_secret)))
        console.print(table)
    except Exception as exc:
        _print_error(exc)
        raise typer.Exit(1) from exc


def _print_trade_plan(plan: TradePlan, status: str, message: str) -> None:
    table = Table(title=f"Trade Plan: {plan.symbol}")
    table.add_column("Field")
    table.add_column("Value")
    table.add_row("Mode", "DRY_RUN" if plan.dry_run else "LIVE")
    table.add_row("Side", plan.side)
    table.add_row("Entry Type", plan.entry_type)
    table.add_row("Entry Price", str(plan.entry_price))
    table.add_row("Stop Loss", str(plan.stop_loss))
    table.add_row("TP Conservative", str(plan.take_profit_levels["conservative"]))
    table.add_row("TP Balanced", str(plan.take_profit_levels["balanced"]))
    table.add_row("TP Aggressive", str(plan.take_profit_levels["aggressive"]))
    table.add_row("Selected TP", str(plan.selected_take_profit))
    table.add_row("Position Size", str(plan.position_size))
    table.add_row("Rounded Qty", str(plan.rounded_qty))
    table.add_row("Status", status)
    table.add_row("Message", message)
    console.print(table)


def _print_dashboard(
    settings: Settings,
    symbol: str,
    category: str,
    price: Decimal,
    coin_balance: dict,
    plan: RescuePlan,
) -> None:
    mode = "DRY_RUN" if settings.dry_run else "LIVE"
    venue = "TESTNET" if settings.testnet else "MAINNET"
    header = Table.grid(expand=True)
    header.add_column(justify="left")
    header.add_column(justify="right")
    header.add_row(
        "[bold]BYBIT TRADING CORE[/bold]",
        f"[bold yellow]{mode} / {venue}[/bold yellow]",
    )
    console.print(Panel(header, style="cyan"))

    account = Table.grid(padding=(0, 1))
    account.add_column()
    account.add_column(justify="right")
    account.add_row("[bold]ACCOUNT[/bold]", "")
    account.add_row("Balance", f"{_short_money(_balance_decimal(coin_balance))} USDT")
    account.add_row(
        "Available",
        f"{_short_money(Decimal(str(_available_balance_value(coin_balance))))} USDT",
    )
    account.add_row("Equity", f"{coin_balance.get('equity', '-')}")

    market_info = Table.grid(padding=(0, 1))
    market_info.add_column()
    market_info.add_column(justify="right")
    market_info.add_row(f"[bold]{symbol}[/bold]", "")
    market_info.add_row("Category", category)
    market_info.add_row("Price", _short_money(price))
    market_info.add_row("Trend", "not calculated")

    risk_style = _risk_style(plan.risk_level)
    risk = Table.grid(padding=(0, 1))
    risk.add_column()
    risk.add_column(justify="right")
    risk.add_row("[bold]RISK STATUS[/bold]", "")
    risk.add_row("Level", f"[{risk_style}]{plan.risk_level.upper()}[/{risk_style}]")
    risk.add_row("Leverage", f"{plan.leverage}x" if plan.leverage else "-")
    risk.add_row("Loss", f"[red]{_money(plan.unrealised_pnl)}[/red]")

    top = Table.grid(expand=True)
    top.add_column(ratio=1)
    top.add_column(ratio=1)
    top.add_column(ratio=1)
    top.add_row(
        Panel(account, title="ACCOUNT"),
        Panel(market_info, title=symbol),
        Panel(risk, title="RISK STATUS", border_style=risk_style),
    )
    console.print(top)

    side = "Long" if plan.side == "Buy" else "Short"
    position = Table.grid(padding=(0, 1))
    position.add_column()
    position.add_column(justify="right")
    position.add_row("Side", side)
    position.add_row("Size", f"{plan.qty} BTC")
    position.add_row("Entry", _money(plan.avg_price))
    position.add_row("Mark", _money(plan.mark_price))
    position.add_row("Liquidation", str(plan.liquidation_price or "-"))
    position.add_row("Unrealised PnL", f"[red]{_money(plan.unrealised_pnl)} USDT[/red]")
    console.print(Panel(position, title="CURRENT POSITION"))

    rescue = Table.grid(padding=(0, 1))
    rescue.add_column()
    rescue.add_column(justify="right")
    rescue.add_row(
        "До безубытка",
        f"+{_money(abs(plan.distance_to_breakeven))} / +{plan.required_rebound_percent:.2f}%",
    )
    rescue.add_row(
        "Risk Score", f"[{risk_style}]{plan.risk_score} / 100[/{risk_style}]"
    )
    rescue.add_row("", "")
    rescue.add_row(
        "[ Рассчитать спасение ] [ Закрыть 25% ] [ Закрыть 50% ]",
        "",
    )
    rescue.add_row(
        "[ TP лестница ] [ Рассчитать усреднение ] [ Защитный SL ]",
        "",
    )
    console.print(Panel(rescue, title="RESCUE MODE", border_style=risk_style))

    scenarios = Table.grid(padding=(0, 1))
    scenarios.add_column()
    scenarios.add_row("A. Conservative: снизить риск")
    scenarios.add_row("B. Breakeven Recovery: выйти в ноль")
    scenarios.add_row("C. Controlled Averaging: аккуратное усреднение")
    scenarios.add_row("D. Hedge: встречная позиция")
    console.print(Panel(scenarios, title="SCENARIOS"))

    if plan.warnings:
        console.print(
            Panel(
                "\n".join(f"- {warning}" for warning in plan.warnings),
                title="WARNINGS",
                border_style=risk_style,
            )
        )


def _print_rescue_plan(plan: RescuePlan, mode: str) -> None:
    title_side = "LONG" if plan.side == "Buy" else "SHORT"
    console.print(Panel(f"RESCUE PLAN: {plan.symbol} {title_side}", title="Rescue"))

    current = Table(title="Current Position")
    current.add_column("Field")
    current.add_column("Value")
    current.add_row("Qty", str(plan.qty))
    current.add_row("Avg Entry", _money(plan.avg_price))
    current.add_row("Mark Price", _money(plan.mark_price))
    current.add_row("Unrealised PnL", _money(plan.unrealised_pnl))
    current.add_row("Leverage", f"{plan.leverage}x" if plan.leverage else "-")
    current.add_row("Liquidation", str(plan.liquidation_price or "-"))
    console.print(current)

    risk = Table(title="Risk")
    risk.add_column("Field")
    risk.add_column("Value")
    risk.add_row("Drawdown", f"{plan.drawdown_percent:.2f}%")
    risk.add_row("Loss / Balance", f"{plan.loss_to_balance_percent:.2f}%")
    risk.add_row("Risk Score", str(plan.risk_score))
    risk.add_row("Risk Level", plan.risk_level.upper())
    console.print(risk)

    breakeven = Table(title="Breakeven")
    breakeven.add_column("Field")
    breakeven.add_column("Value")
    breakeven.add_row("Breakeven Price", _money(plan.breakeven_price))
    breakeven.add_row("Distance", _money(plan.distance_to_breakeven))
    breakeven.add_row("Required Rebound", f"{plan.required_rebound_percent:.2f}%")
    console.print(breakeven)

    conservative = plan.conservative_scenario
    reduce_table = Table(title="Scenario A: Reduce Risk")
    reduce_table.add_column("Action")
    reduce_table.add_column("Qty")
    reduce_table.add_column("Realized PnL")
    reduce_table.add_column("Remaining Qty")
    reduce_table.add_row(
        "Close 25%",
        str(conservative["close_25_qty"]),
        _money(conservative["realized_loss_25"]),
        str(conservative["remaining_qty_25"]),
    )
    reduce_table.add_row(
        "Close 50%",
        str(conservative["close_50_qty"]),
        _money(conservative["realized_loss_50"]),
        str(conservative["remaining_qty_50"]),
    )
    console.print(reduce_table)

    rebound = Table(title="Scenario B: Exit by Rebound")
    rebound.add_column("Level")
    rebound.add_column("Price")
    for name, value in plan.breakeven_scenario["levels"].items():
        rebound.add_row(name.upper(), _money(value))
    console.print(rebound)

    averaging = Table(title=f"Scenario C: Controlled Averaging ({mode})")
    averaging.add_column("Variant")
    averaging.add_column("Add Qty")
    averaging.add_column("Cost")
    averaging.add_column("New Avg")
    averaging.add_column("Required Rebound")
    for name, data in plan.averaging_scenario.items():
        averaging.add_row(
            name,
            str(data["add_qty"]),
            _money(data["estimated_cost"]),
            _money(data["new_avg_price"]),
            f"{data['required_rebound_percent']:.2f}%",
        )
    console.print(averaging)

    if plan.target_average_scenario:
        target = Table(title="Scenario D: Target Average")
        target.add_column("Field")
        target.add_column("Value")
        for key, value in plan.target_average_scenario.items():
            target.add_row(key, str(value))
        console.print(target)

    if plan.warnings:
        console.print(
            Panel("\n".join(f"- {item}" for item in plan.warnings), title="Warnings")
        )

    console.print(
        Panel(
            "1. Do not add size immediately.\n"
            "2. Check liquidation price.\n"
            "3. Consider closing 25-50% to reduce liquidation risk.\n"
            "4. Place protective SL for remaining position.\n"
            "5. Use TP ladder for partial exit.\n"
            "6. Only consider averaging if risk score falls below HIGH.",
            title="Recommended Steps",
        )
    )


def _extract_coin_balance(response: dict, coin: str) -> dict:
    accounts = response.get("result", {}).get("list", [])
    if not accounts:
        raise ValueError("Wallet balance response is empty")
    for item in accounts[0].get("coin", []):
        if item.get("coin") == coin:
            return item
    raise ValueError(f"{coin} balance not found")


def _available_balance_value(data: dict) -> str:
    return str(
        data.get("availableToWithdraw")
        or data.get("availableToBorrow")
        or data.get("walletBalance")
        or data.get("equity")
        or "0"
    )


def _money(value: Decimal) -> str:
    return f"{value:.2f}"


def _short_money(value: Decimal) -> str:
    return f"{value:.0f}"


def _balance_decimal(data: dict) -> Decimal:
    return Decimal(
        str(
            data.get("walletBalance")
            or data.get("equity")
            or data.get("availableToWithdraw")
            or "0"
        )
    )


def _risk_style(risk_level: str) -> str:
    if risk_level == "critical":
        return "bold red"
    if risk_level == "high":
        return "red"
    if risk_level == "medium":
        return "yellow"
    return "green"


def _print_error(exc: Exception) -> None:
    console.print(Panel(str(exc), title="Error", style="bold red"))


def _validate_choice(value: str, name: str, allowed: set[str]) -> str:
    if value not in allowed:
        allowed_values = ", ".join(sorted(allowed))
        raise ValueError(f"Invalid {name}: {value}. Allowed: {allowed_values}")
    return value
