from decimal import Decimal
from secrets import compare_digest
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.account_service import AccountService
from app.bybit_client import BybitClient
from app.config import Settings, load_settings
from app.market_service import MarketService
from app.models import TradeSignal
from app.order_service import OrderService
from app.position_service import PositionService
from app.rescue_service import RescueService
from app.trade_planner import TradePlanner


class TradePlanRequest(BaseModel):
    symbol: str = "BTCUSDT"
    category: str = "linear"
    side: str
    entry_type: str = "Market"
    entry_price: Decimal | None = None
    risk_percent: Decimal = Decimal("1")
    stop_loss_percent: Decimal = Decimal("1")
    take_profit_mode: str = "balanced"


class RescueRequest(BaseModel):
    category: str = "linear"
    side: str | None = None
    target_avg: Decimal | None = None
    target_exit: Decimal | None = None
    max_extra_margin: Decimal | None = None
    max_add_qty: Decimal | None = None


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


def create_services() -> ServiceContainer:
    return ServiceContainer(load_settings())


def get_services() -> ServiceContainer:
    return create_services()


def require_api_auth(authorization: str | None = Header(default=None)) -> None:
    settings = load_settings()
    if not settings.web_auth_required:
        return
    if not settings.web_api_token:
        raise HTTPException(
            status_code=503,
            detail="WEB_API_TOKEN is required when WEB_AUTH_REQUIRED=true",
        )
    expected = f"Bearer {settings.web_api_token}"
    if not authorization or not compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid API token")


api = FastAPI(
    title="Bybit Trading Core API",
    version="0.1.0",
    description="Read-only and DRY_RUN API for Bybit Trading Core MVP.",
)

api.add_middleware(
    CORSMiddleware,
    allow_origins=list(load_settings().web_cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@api.get("/api/health")
def health(services: ServiceContainer = Depends(get_services)) -> dict[str, Any]:
    return {
        "status": "ok",
        "dry_run": services.settings.dry_run,
        "testnet": services.settings.testnet,
        "live_trading": False,
        "auth_required": services.settings.web_auth_required,
    }


@api.get("/api/account/balance")
def account_balance(
    _: None = Depends(require_api_auth),
    services: ServiceContainer = Depends(get_services),
) -> dict[str, Any]:
    try:
        response = services.account_service.get_coin_balance(
            coin="USDT",
            account_type=services.settings.account_type,
        )
        coin = _extract_coin_balance(response, "USDT")
        return {
            "account_type": services.settings.account_type,
            "coin": "USDT",
            "wallet_balance": coin.get("walletBalance"),
            "equity": coin.get("equity"),
            "available_balance": _available_balance_value(coin),
        }
    except Exception as exc:
        raise _http_error(exc) from exc


@api.get("/api/market/{symbol}")
def market(
    symbol: str,
    category: str = "linear",
    _: None = Depends(require_api_auth),
    services: ServiceContainer = Depends(get_services),
) -> dict[str, Any]:
    try:
        price = services.market_service.get_last_price(category=category, symbol=symbol)
        rules = services.market_service.get_instrument_rules(
            category=category,
            symbol=symbol,
        )
        return {
            "symbol": symbol,
            "category": category,
            "current_price": price,
            "rules": rules,
        }
    except Exception as exc:
        raise _http_error(exc) from exc


@api.get("/api/market/{symbol}/trend")
def market_trend(
    symbol: str,
    category: str = "linear",
    interval: str = "15",
    limit: int = 120,
    side: str | None = None,
    _: None = Depends(require_api_auth),
    services: ServiceContainer = Depends(get_services),
) -> dict[str, Any]:
    try:
        response = services.market_service.get_kline(
            category=category,
            symbol=symbol,
            interval=interval,
            limit=limit,
        )
        return _build_trend_analysis(
            response=response,
            symbol=symbol,
            interval=interval,
            side=side,
        )
    except Exception as exc:
        raise _http_error(exc) from exc


@api.get("/api/positions")
def positions(
    category: str = "linear",
    symbol: str | None = None,
    settle_coin: str | None = "USDT",
    _: None = Depends(require_api_auth),
    services: ServiceContainer = Depends(get_services),
) -> dict[str, Any]:
    try:
        response = services.position_service.get_positions(
            category=category,
            symbol=symbol,
            settle_coin=settle_coin if not symbol else None,
        )
        items = response.get("result", {}).get("list", [])
        return {"category": category, "positions": items}
    except Exception as exc:
        raise _http_error(exc) from exc


@api.get("/api/positions/{symbol}")
def position_by_symbol(
    symbol: str,
    category: str = "linear",
    side: str | None = None,
    _: None = Depends(require_api_auth),
    services: ServiceContainer = Depends(get_services),
) -> dict[str, Any]:
    try:
        position = services.position_service.get_position_by_symbol(
            category=category,
            symbol=symbol,
            side=side,
        )
        if not position:
            raise HTTPException(status_code=404, detail="Position not found")
        return {"category": category, "position": position}
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_error(exc) from exc


@api.post("/api/trade/plan")
def trade_plan(
    payload: TradePlanRequest,
    _: None = Depends(require_api_auth),
    services: ServiceContainer = Depends(get_services),
) -> dict[str, Any]:
    try:
        signal = TradeSignal(
            symbol=payload.symbol,
            category=payload.category,
            side=payload.side,
            entry_type=payload.entry_type,
            entry_price=payload.entry_price,
            risk_percent=payload.risk_percent,
            stop_loss_percent=payload.stop_loss_percent,
            take_profit_mode=payload.take_profit_mode,
        )
        plan = services.trade_planner.build_trade_plan(signal)
        return {
            "status": "dry_run" if services.settings.dry_run else "planned",
            "message": "Order was not sent. API is calculation-only in MVP.",
            "trade_plan": plan,
        }
    except Exception as exc:
        raise _http_error(exc) from exc


@api.post("/api/rescue/{symbol}")
def rescue_plan(
    symbol: str,
    payload: RescueRequest | None = None,
    _: None = Depends(require_api_auth),
    services: ServiceContainer = Depends(get_services),
) -> dict[str, Any]:
    try:
        request = payload or RescueRequest()
        position = services.position_service.get_position_by_symbol(
            category=request.category,
            symbol=symbol,
            side=request.side,
        )
        if not position or Decimal(str(position.get("size") or "0")) <= 0:
            raise HTTPException(status_code=404, detail="Active position not found")

        balance_response = services.account_service.get_coin_balance(
            coin="USDT",
            account_type=services.settings.account_type,
        )
        coin = _extract_coin_balance(balance_response, "USDT")
        balance = Decimal(
            str(
                coin.get("walletBalance")
                or coin.get("equity")
                or coin.get("availableToWithdraw")
                or "0"
            )
        )
        available_balance = Decimal(str(_available_balance_value(coin)))
        plan = services.rescue_service.build_rescue_plan(
            position=position,
            balance=balance,
            available_balance=available_balance,
            target_avg=request.target_avg or request.target_exit,
            max_extra_margin=request.max_extra_margin,
            max_add_qty=request.max_add_qty,
        )
        return {
            "status": "calculation_only",
            "message": "Rescue Mode does not send orders in MVP.",
            "rescue_plan": plan,
            "trend": _safe_trend_analysis(
                services=services,
                category=request.category,
                symbol=symbol,
                side=plan.side,
            ),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_error(exc) from exc


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


def _safe_trend_analysis(
    services: ServiceContainer,
    category: str,
    symbol: str,
    side: str | None,
) -> dict[str, Any] | None:
    try:
        response = services.market_service.get_kline(
            category=category,
            symbol=symbol,
            interval="15",
            limit=120,
        )
        return _build_trend_analysis(
            response=response,
            symbol=symbol,
            interval="15",
            side=side,
        )
    except Exception:
        return None


def _build_trend_analysis(
    response: dict,
    symbol: str,
    interval: str,
    side: str | None = None,
) -> dict[str, Any]:
    raw_candles = response.get("result", {}).get("list", [])
    candles = sorted(raw_candles, key=lambda item: int(item[0]))
    closes = [Decimal(str(item[4])) for item in candles if len(item) >= 5]
    if len(closes) < 5:
        raise ValueError("Not enough candles for trend analysis")

    first_close = closes[0]
    last_close = closes[-1]
    move_percent = (last_close - first_close) / first_close * Decimal("100")
    short_window = closes[-20:] if len(closes) >= 20 else closes
    long_window = closes[-60:] if len(closes) >= 60 else closes
    short_ma = sum(short_window) / Decimal(len(short_window))
    long_ma = sum(long_window) / Decimal(len(long_window))
    ma_gap_percent = (short_ma - long_ma) / long_ma * Decimal("100")

    if abs(move_percent) < Decimal("0.35") and abs(ma_gap_percent) < Decimal("0.15"):
        direction = "sideways"
    elif short_ma > long_ma and move_percent >= 0:
        direction = "up"
    elif short_ma < long_ma and move_percent <= 0:
        direction = "down"
    else:
        direction = "mixed"

    strength = min(
        100,
        int(abs(move_percent) * Decimal("8") + abs(ma_gap_percent) * Decimal("18")),
    )
    alignment = _trend_alignment(direction=direction, side=side)
    return {
        "symbol": symbol,
        "interval": interval,
        "direction": direction,
        "strength": strength,
        "move_percent": move_percent,
        "short_ma": short_ma,
        "long_ma": long_ma,
        "alignment": alignment,
        "summary": _trend_summary(direction=direction, side=side, alignment=alignment),
    }


def _trend_alignment(direction: str, side: str | None) -> str:
    if direction in {"sideways", "mixed"} or side not in {"Buy", "Sell"}:
        return "neutral"
    if (side == "Buy" and direction == "up") or (side == "Sell" and direction == "down"):
        return "with_position"
    return "against_position"


def _trend_summary(direction: str, side: str | None, alignment: str) -> str:
    direction_text = {
        "up": "краткосрочный тренд вверх",
        "down": "краткосрочный тренд вниз",
        "sideways": "рынок без явного направления",
        "mixed": "смешанный сигнал",
    }.get(direction, "тренд не определен")
    if alignment == "with_position":
        return f"{direction_text}; движение сейчас помогает позиции."
    if alignment == "against_position":
        if side == "Buy":
            return f"{direction_text}; для лонга это риск, сначала снижай нагрузку."
        return f"{direction_text}; для шорта это риск, сначала снижай нагрузку."
    return f"{direction_text}; решение лучше принимать от риска, а не от импульса."


def _http_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))
