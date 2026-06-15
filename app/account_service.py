from decimal import Decimal
from typing import Any

from app.bybit_client import ensure_success
from app.config import Settings
from app.logger import get_logger

logger = get_logger(__name__)


class AccountService:
    def __init__(self, session: Any, settings: Settings):
        self.session = session
        self.settings = settings

    def get_wallet_balance(self, account_type: str = "UNIFIED") -> dict:
        self.settings.require_private_credentials()
        logger.info("Fetching wallet balance: account_type=%s", account_type)
        return ensure_success(
            self.session.get_wallet_balance(accountType=account_type),
            "get_wallet_balance",
        )

    def get_coin_balance(
        self, coin: str = "USDT", account_type: str = "UNIFIED"
    ) -> dict:
        self.settings.require_private_credentials()
        logger.info(
            "Fetching coin balance: account_type=%s coin=%s", account_type, coin
        )
        return ensure_success(
            self.session.get_wallet_balance(accountType=account_type, coin=coin),
            "get_coin_balance",
        )

    def get_fee_rate(self, category: str, symbol: str) -> dict:
        self.settings.require_private_credentials()
        logger.info("Fetching fee rate: category=%s symbol=%s", category, symbol)
        return ensure_success(
            self.session.get_fee_rates(category=category, symbol=symbol),
            "get_fee_rate",
        )

    def get_available_balance(
        self, coin: str = "USDT", account_type: str = "UNIFIED"
    ) -> Decimal:
        response = self.get_coin_balance(coin=coin, account_type=account_type)
        accounts = response.get("result", {}).get("list", [])
        if not accounts:
            raise ValueError("Wallet balance response is empty")

        coins = accounts[0].get("coin", [])
        for item in coins:
            if item.get("coin") == coin:
                value = (
                    item.get("availableToWithdraw")
                    or item.get("walletBalance")
                    or item.get("equity")
                )
                if value is None:
                    raise ValueError(f"No usable balance field for {coin}")
                balance = Decimal(str(value))
                if balance <= 0:
                    raise ValueError(f"Insufficient {coin} balance")
                return balance
        raise ValueError(f"{coin} balance not found")
