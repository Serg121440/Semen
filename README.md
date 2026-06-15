# Bybit API Trading Core

Safe Python MVP for Bybit Unified Trading V5 API. The default mode is testnet
and dry run, so orders are not sent unless you explicitly change `.env`.

## Safety Defaults

```env
BYBIT_TESTNET=true
DRY_RUN=true
REQUIRE_ORDER_CONFIRMATION=true
```

With `DRY_RUN=true`, order methods return the prepared request and do not call
Bybit order creation. Set `DRY_RUN=false` only when you intentionally want to
send orders to Bybit Testnet.

With `REQUIRE_ORDER_CONFIRMATION=true`, opening or cancelling an order also
requires an explicit confirmation argument in code. Without it, real order
actions are blocked even if `DRY_RUN=false`.

## Setup

```bash
cd bybit_trading_core
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Add your Bybit Testnet API key and secret to `.env` for private endpoints such
as balances, positions, and order sending.

## Examples

```bash
python examples/get_market_info.py
python examples/get_balance.py
python examples/get_positions.py
python examples/place_test_order.py
```

## CLI

По умолчанию CLI работает в `DRY_RUN`. Ордеры не отправляются.
Для тестовой отправки ордера нужно использовать Bybit Testnet и
`DRY_RUN=false`. Mainnet trading в CLI пока запрещен.

```bash
python main.py menu
python main.py market BTCUSDT
python main.py dashboard BTCUSDT
python main.py balance
python main.py positions
python main.py plan --side Buy --risk 0.5 --sl 1
python main.py plan --side Sell --risk 0.5 --sl 1 --tp aggressive
python main.py plan --side Buy --entry-type Limit --entry-price 66000 --risk 0.5 --sl 1
python main.py rescue BTCUSDT
python main.py rescue BTCUSDT --target-exit 72000
python main.py rescue BTCUSDT --mode conservative
python main.py orders
python main.py risk-monitor
python main.py journal
python main.py settings
```

Main menu sections:

```text
1. Dashboard
2. Positions
3. Rescue Mode
4. Trade Planner
5. Orders
6. Risk Monitor
7. Journal
8. Settings
```

`rescue` is calculation-only in this MVP. It creates a Rescue Planner /
Anti-Liquidation Planner with four scenarios:

- Scenario A: protective risk reduction.
- Scenario B: partial exit and breakeven TP ladder.
- Scenario C: controlled averaging calculations.
- Scenario D: target average calculation when `--target-exit` or
  `--target-avg` is provided.

`dashboard` shows the main terminal screen: account, market, risk status,
current position, rescue mode summary, and scenario list. Action labels such as
`[ Закрыть 25% ]` are safe prompts only in this version; they do not send
orders.

## FastAPI Backend

The web API is read-only / calculation-only in the MVP. It never exposes API
secrets and does not send orders.

Run locally:

```bash
uvicorn app.web_api:api --reload --host 127.0.0.1 --port 8000
```

Endpoints:

```text
GET  /api/health
GET  /api/account/balance
GET  /api/market/{symbol}
GET  /api/positions
GET  /api/positions/{symbol}
POST /api/trade/plan
POST /api/rescue/{symbol}
```

`POST /api/trade/plan` returns a DRY_RUN trade plan only. `POST
/api/rescue/{symbol}` returns a Rescue Plan only.

## Frontend Dashboard

The Next.js frontend lives in `frontend/` and connects to FastAPI at
`http://127.0.0.1:8000` by default.

```bash
cd frontend
npm install
npm run dev
```

The frontend is calculation-only: it has no order submission buttons and never
stores API keys or secrets in the browser.

## Quality Checks

```bash
pytest
ruff check .
black --check .
```

## Project Layout

```text
app/
  config.py
  logger.py
  bybit_client.py
  market_service.py
  account_service.py
  position_service.py
  order_service.py
  risk_service.py
  rounding_service.py
  trade_planner.py
  web_api.py
  models.py
examples/
tests/
frontend/
```
