import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def build_services():
    from app.account_service import AccountService
    from app.bybit_client import BybitClient
    from app.config import load_settings
    from app.market_service import MarketService
    from app.order_service import OrderService
    from app.position_service import PositionService
    from app.trade_planner import TradePlanner

    settings = load_settings()
    session = BybitClient(settings).get_http_session()
    market_service = MarketService(session)
    account_service = AccountService(session, settings)
    order_service = OrderService(session, settings)
    position_service = PositionService(session, settings)
    trade_planner = TradePlanner(
        settings=settings,
        market_service=market_service,
        account_service=account_service,
        order_service=order_service,
    )
    return settings, market_service, account_service, position_service, trade_planner
