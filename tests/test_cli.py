from decimal import Decimal

from typer.testing import CliRunner

from app import cli
from app.config import Settings
from app.models import DryRunResult, TradePlan

runner = CliRunner()


class FakeTradePlanner:
    def __init__(self) -> None:
        self.sent = False

    def build_trade_plan(self, signal):
        return _trade_plan(dry_run=True)

    def execute_trade_signal(self, signal, confirm_order: bool = False):
        self.sent = True
        plan = _trade_plan(dry_run=True)
        return DryRunResult(
            status="dry_run",
            message="DRY_RUN=true: order was not sent",
            trade_plan=plan,
        )


class FakeServices:
    def __init__(self) -> None:
        self.settings = Settings(
            api_key="key",
            api_secret="secret",
            dry_run=True,
            testnet=False,
        )
        self.trade_planner = FakeTradePlanner()


def _trade_plan(dry_run: bool) -> TradePlan:
    return TradePlan(
        symbol="BTCUSDT",
        category="linear",
        side="Buy",
        entry_type="Market",
        entry_price=Decimal("100"),
        stop_loss=Decimal("99"),
        take_profit_levels={
            "conservative": Decimal("101"),
            "balanced": Decimal("102"),
            "aggressive": Decimal("103"),
        },
        selected_take_profit=Decimal("102"),
        position_size=Decimal("1"),
        rounded_qty=Decimal("1"),
        dry_run=dry_run,
    )


def test_plan_creates_trade_plan(monkeypatch) -> None:
    services = FakeServices()
    monkeypatch.setattr(cli, "build_services", lambda: services)

    result = runner.invoke(cli.app, ["plan", "--side", "Buy", "--risk", "0.5"])

    assert result.exit_code == 0
    assert "Trade Plan: BTCUSDT" in result.output


def test_plan_send_does_not_bypass_dry_run(monkeypatch) -> None:
    services = FakeServices()
    monkeypatch.setattr(cli, "build_services", lambda: services)

    result = runner.invoke(
        cli.app,
        ["plan", "--side", "Buy", "--risk", "0.5", "--send"],
    )

    assert result.exit_code == 0
    assert "DRY_RUN is enabled. Order was not sent." in result.output
    assert services.trade_planner.sent is True


def test_plan_blocks_risk_greater_than_two() -> None:
    result = runner.invoke(cli.app, ["plan", "--side", "Buy", "--risk", "2.1"])

    assert result.exit_code == 1
    assert "Risk greater than 2%" in result.output


def test_plan_rejects_invalid_side() -> None:
    result = runner.invoke(cli.app, ["plan", "--side", "Hold"])

    assert result.exit_code != 0


def test_plan_rejects_invalid_entry_type() -> None:
    result = runner.invoke(
        cli.app,
        ["plan", "--side", "Buy", "--entry-type", "Stop"],
    )

    assert result.exit_code != 0
