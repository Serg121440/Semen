# Подключение Trading Core Redesign к боевым данным

Редизайн использует единый слой состояния `/api/state`. Моки нужны только для демо-превью; в боевом режиме интерфейс должен читать FastAPI/Bybit через этот endpoint.

## Endpoint

```http
GET /api/state?symbol=BTCUSDT
GET /api/state?symbol=BTCUSDT&side=Sell
```

Ответ:

```json
{
  "wallet": 1952.19,
  "equity": -33,
  "marks": {
    "BTCUSDT": 64183.5,
    "ETHUSDT": 1749.9
  },
  "positions": [
    {
      "sym": "BTCUSDT",
      "side": "Sell",
      "size": 0.11,
      "entry": 61158.28,
      "liq": 72225.09,
      "tp": 59000
    }
  ],
  "levels": [],
  "heatmap": [],
  "scenarios": {},
  "source": {
    "label": "FastAPI · Bybit",
    "connected": true,
    "mode": "api"
  }
}
```

## Нормализация

Фронтовый слой терпит альтернативные имена полей Bybit:

- `wallet` из `wallet`, `walletBalance`, `equity`
- `marks` из `marks`, `prices`
- `positions` из `positions`, `list`
- `sym` из `sym`, `symbol`
- `size` из `size`, `qty`, `contracts`
- `entry` из `entry`, `avgPrice`, `entryPrice`
- `liq` из `liq`, `liqPrice`, `liquidationPrice`
- `tp` из `tp`, `takeProfit`
- `side` берется из `side`, а если его нет, выводится из знака размера

## Что считается на фронте

Backend не обязан отдавать готовые расчеты:

- uPnL
- дистанция до ликвидации
- риск-скоринг
- проекции rescue/what-if

Эти значения можно считать из `positions` + `marks`.

## Текущая реализация

В Next-приложении `/api/state` собирает состояние из существующего `loadDashboard()`, поэтому FastAPI-роуты менять не нужно.

Источник данных в шапке отображается как `FastAPI · Bybit`.

## WebSocket вместо polling

Polling можно заменить на Bybit WebSocket: на каждом апдейте цены или позиции нужно обновлять `marks`/`positions` и применять ту же нормализацию. Контракт `/api/state` при этом остается полезным как initial snapshot и fallback.
