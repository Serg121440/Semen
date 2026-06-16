from typing import Any

from app.config import Settings
from app.logger import get_logger

logger = get_logger(__name__)


class BybitClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._session: Any | None = None

    def get_http_session(self) -> Any:
        if self._session is not None:
            return self._session

        try:
            from pybit.unified_trading import HTTP
        except ImportError as exc:
            raise RuntimeError(
                "pybit is not installed. Install dependencies from requirements.txt"
            ) from exc

        kwargs: dict[str, Any] = {"testnet": self.settings.testnet}
        if self.settings.api_key and self.settings.api_secret:
            kwargs["api_key"] = self.settings.api_key
            kwargs["api_secret"] = self.settings.api_secret

        logger.info(
            "Connecting to Bybit HTTP API: testnet=%s credentials=%s",
            self.settings.testnet,
            "present" if self.settings.api_key else "absent",
        )
        self._session = HTTP(**kwargs)
        return self._session


def ensure_success(response: dict, operation: str) -> dict:
    ret_code = response.get("retCode")
    if ret_code not in (None, 0):
        ret_msg = response.get("retMsg", "Unknown Bybit API error")
        logger.error(
            "Bybit API error during %s: retCode=%s retMsg=%s",
            operation,
            ret_code,
            ret_msg,
        )
        raise RuntimeError(f"Bybit API error during {operation}: {ret_code} {ret_msg}")
    return response
