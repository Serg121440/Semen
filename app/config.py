import os
from dataclasses import dataclass
from decimal import Decimal

from dotenv import load_dotenv

from app.logger import get_logger

logger = get_logger(__name__)


def parse_bool(value: str | bool | None, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True)
class Settings:
    api_key: str | None
    api_secret: str | None
    testnet: bool = True
    dry_run: bool = True
    account_type: str = "UNIFIED"
    default_category: str = "linear"
    default_symbol: str = "BTCUSDT"
    default_risk_percent: Decimal = Decimal("1")
    default_stop_loss_percent: Decimal = Decimal("1")
    default_take_profit_mode: str = "balanced"
    require_order_confirmation: bool = True
    live_trading: bool = False
    web_auth_required: bool = True
    web_api_token: str | None = None
    web_cors_origins: tuple[str, ...] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )

    def require_private_credentials(self) -> None:
        missing = []
        if not self.api_key:
            missing.append("BYBIT_API_KEY")
        if not self.api_secret:
            missing.append("BYBIT_API_SECRET")
        if missing:
            raise ValueError("Missing private Bybit credentials: " + ", ".join(missing))


def load_settings() -> Settings:
    load_dotenv()
    settings = Settings(
        api_key=os.getenv("BYBIT_API_KEY") or None,
        api_secret=os.getenv("BYBIT_API_SECRET") or None,
        testnet=parse_bool(os.getenv("BYBIT_TESTNET"), default=True),
        dry_run=parse_bool(os.getenv("DRY_RUN"), default=True),
        account_type=os.getenv("BYBIT_ACCOUNT_TYPE", "UNIFIED"),
        default_category=os.getenv("DEFAULT_CATEGORY", "linear"),
        default_symbol=os.getenv("DEFAULT_SYMBOL", "BTCUSDT"),
        default_risk_percent=Decimal(os.getenv("DEFAULT_RISK_PERCENT", "1")),
        default_stop_loss_percent=Decimal(os.getenv("DEFAULT_STOP_LOSS_PERCENT", "1")),
        default_take_profit_mode=os.getenv("DEFAULT_TAKE_PROFIT_MODE", "balanced"),
        require_order_confirmation=parse_bool(
            os.getenv("REQUIRE_ORDER_CONFIRMATION"),
            default=True,
        ),
        live_trading=parse_bool(os.getenv("LIVE_TRADING"), default=False),
        web_auth_required=parse_bool(os.getenv("WEB_AUTH_REQUIRED"), default=True),
        web_api_token=os.getenv("WEB_API_TOKEN") or None,
        web_cors_origins=tuple(
            origin.strip()
            for origin in os.getenv(
                "WEB_CORS_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000",
            ).split(",")
            if origin.strip()
        ),
    )
    logger.info(
        "Configuration loaded: testnet=%s dry_run=%s account_type=%s symbol=%s require_confirmation=%s live_trading=%s web_auth=%s",
        settings.testnet,
        settings.dry_run,
        settings.account_type,
        settings.default_symbol,
        settings.require_order_confirmation,
        settings.live_trading,
        settings.web_auth_required,
    )
    return settings
