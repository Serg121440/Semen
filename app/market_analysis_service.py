from decimal import Decimal
from typing import Any

from app.market_service import MarketService


INTERVALS = ("15", "60", "240", "D")
OI_INTERVALS = {
    "15": "15min",
    "60": "1h",
    "240": "4h",
    "D": "1d",
}


class MarketAnalysisService:
    def __init__(self, market_service: MarketService):
        self.market_service = market_service

    def build_analysis(
        self,
        category: str,
        symbol: str,
        side: str | None = None,
        liquidation_price: Decimal | None = None,
    ) -> dict[str, Any]:
        intervals = {}
        for interval in INTERVALS:
            kline = self.market_service.get_kline(
                category=category,
                symbol=symbol,
                interval=interval,
                limit=200,
            )
            intervals[interval] = self._analyse_interval(
                response=kline,
                interval=interval,
                side=side,
            )

        orderbook = self.market_service.get_orderbook(
            category=category,
            symbol=symbol,
            limit=200,
        )
        liquidity_map = self._build_liquidity_map(
            response=orderbook,
            liquidation_price=liquidation_price,
        )
        open_interest = self._build_open_interest(
            category=category,
            symbol=symbol,
        )
        consensus = self._build_consensus(intervals=intervals, side=side)
        return {
            "symbol": symbol,
            "category": category,
            "intervals": intervals,
            "open_interest": open_interest,
            "liquidity_map": liquidity_map,
            "consensus": consensus,
        }

    def _analyse_interval(
        self,
        response: dict,
        interval: str,
        side: str | None,
    ) -> dict[str, Any]:
        candles = _parse_candles(response)
        if len(candles) < 30:
            raise ValueError("Not enough candles for technical analysis")

        closes = [item["close"] for item in candles]
        highs = [item["high"] for item in candles]
        lows = [item["low"] for item in candles]
        volumes = [item["volume"] for item in candles]
        current = closes[-1]
        first = closes[0]
        move_percent = (current - first) / first * Decimal("100")
        ema20 = _ema(closes, 20)
        ema50 = _ema(closes, 50)
        rsi14 = _rsi(closes, 14)
        macd_line, macd_signal, macd_hist = _macd(closes)
        atr14 = _atr(highs, lows, closes, 14)
        support = min(lows[-40:])
        resistance = max(highs[-40:])
        avg_volume = sum(volumes[-30:]) / Decimal(len(volumes[-30:]))
        volume_ratio = volumes[-1] / avg_volume if avg_volume > 0 else Decimal("0")
        direction = _direction(
            move_percent=move_percent,
            ema20=ema20,
            ema50=ema50,
            macd_hist=macd_hist,
        )
        alignment = _alignment(direction=direction, side=side)
        strength = min(
            100,
            int(
                abs(move_percent) * Decimal("6")
                + abs((ema20 - ema50) / current * Decimal("100")) * Decimal("16")
                + abs(macd_hist / current * Decimal("100")) * Decimal("35")
            ),
        )
        return {
            "interval": interval,
            "current_price": current,
            "direction": direction,
            "alignment": alignment,
            "strength": strength,
            "move_percent": move_percent,
            "ema20": ema20,
            "ema50": ema50,
            "rsi14": rsi14,
            "macd": {
                "line": macd_line,
                "signal": macd_signal,
                "histogram": macd_hist,
            },
            "atr14": atr14,
            "support": support,
            "resistance": resistance,
            "volume_ratio": volume_ratio,
            "summary": _summary(
                direction=direction,
                alignment=alignment,
                rsi=rsi14,
                volume_ratio=volume_ratio,
            ),
        }

    def _build_open_interest(self, category: str, symbol: str) -> dict[str, Any]:
        result = {}
        for interval, oi_interval in OI_INTERVALS.items():
            try:
                response = self.market_service.get_open_interest(
                    category=category,
                    symbol=symbol,
                    interval_time=oi_interval,
                    limit=2,
                )
                items = response.get("result", {}).get("list", [])
                current = _optional_decimal(items[0].get("openInterest")) if items else None
                previous = (
                    _optional_decimal(items[1].get("openInterest"))
                    if len(items) > 1
                    else None
                )
                change_percent = None
                if current is not None and previous and previous > 0:
                    change_percent = (current - previous) / previous * Decimal("100")
                result[interval] = {
                    "interval": oi_interval,
                    "open_interest": current,
                    "change_percent": change_percent,
                }
            except Exception:
                result[interval] = {
                    "interval": oi_interval,
                    "open_interest": None,
                    "change_percent": None,
                }
        return result

    def _build_liquidity_map(
        self,
        response: dict,
        liquidation_price: Decimal | None,
    ) -> dict[str, Any]:
        data = response.get("result", {})
        bids = _orderbook_side(data.get("b", []), "bid")
        asks = _orderbook_side(data.get("a", []), "ask")
        top_bids = sorted(bids, key=lambda item: item["notional"], reverse=True)[:8]
        top_asks = sorted(asks, key=lambda item: item["notional"], reverse=True)[:8]
        zones = sorted(
            top_bids + top_asks,
            key=lambda item: item["notional"],
            reverse=True,
        )[:12]
        if liquidation_price is not None and liquidation_price > 0:
            zones.append(
                {
                    "price": liquidation_price,
                    "size": Decimal("0"),
                    "notional": Decimal("0"),
                    "side": "liquidation",
                    "label": "твоя ликвидация",
                }
            )
        return {
            "source": "Bybit orderbook + position liquidation price",
            "bids": top_bids,
            "asks": top_asks,
            "zones": zones,
        }

    def _build_consensus(
        self,
        intervals: dict[str, Any],
        side: str | None,
    ) -> dict[str, Any]:
        weights = {"15": 1, "60": 2, "240": 3, "D": 4}
        score = 0
        max_score = sum(weights.values())
        for interval, data in intervals.items():
            direction = data["direction"]
            weight = weights.get(interval, 1)
            if direction == "up":
                score += weight
            elif direction == "down":
                score -= weight

        if score > max_score * Decimal("0.25"):
            direction = "up"
        elif score < -max_score * Decimal("0.25"):
            direction = "down"
        else:
            direction = "mixed"
        alignment = _alignment(direction=direction, side=side)
        return {
            "direction": direction,
            "alignment": alignment,
            "score": score,
            "summary": _consensus_summary(direction=direction, alignment=alignment),
        }


def _parse_candles(response: dict) -> list[dict[str, Decimal]]:
    raw = response.get("result", {}).get("list", [])
    candles = sorted(raw, key=lambda item: int(item[0]))
    return [
        {
            "open": Decimal(str(item[1])),
            "high": Decimal(str(item[2])),
            "low": Decimal(str(item[3])),
            "close": Decimal(str(item[4])),
            "volume": Decimal(str(item[5])),
        }
        for item in candles
        if len(item) >= 6
    ]


def _ema(values: list[Decimal], period: int) -> Decimal:
    if len(values) < period:
        return sum(values) / Decimal(len(values))
    multiplier = Decimal("2") / Decimal(period + 1)
    ema = sum(values[:period]) / Decimal(period)
    for value in values[period:]:
        ema = (value - ema) * multiplier + ema
    return ema


def _rsi(values: list[Decimal], period: int) -> Decimal:
    if len(values) <= period:
        return Decimal("50")
    gains = []
    losses = []
    for index in range(1, period + 1):
        change = values[index] - values[index - 1]
        gains.append(max(change, Decimal("0")))
        losses.append(abs(min(change, Decimal("0"))))
    avg_gain = sum(gains) / Decimal(period)
    avg_loss = sum(losses) / Decimal(period)
    for index in range(period + 1, len(values)):
        change = values[index] - values[index - 1]
        gain = max(change, Decimal("0"))
        loss = abs(min(change, Decimal("0")))
        avg_gain = (avg_gain * Decimal(period - 1) + gain) / Decimal(period)
        avg_loss = (avg_loss * Decimal(period - 1) + loss) / Decimal(period)
    if avg_loss == 0:
        return Decimal("100")
    rs = avg_gain / avg_loss
    return Decimal("100") - (Decimal("100") / (Decimal("1") + rs))


def _macd(values: list[Decimal]) -> tuple[Decimal, Decimal, Decimal]:
    macd_values = []
    for index in range(26, len(values) + 1):
        window = values[:index]
        macd_values.append(_ema(window, 12) - _ema(window, 26))
    if not macd_values:
        return Decimal("0"), Decimal("0"), Decimal("0")
    line = macd_values[-1]
    signal = _ema(macd_values, 9)
    return line, signal, line - signal


def _atr(
    highs: list[Decimal],
    lows: list[Decimal],
    closes: list[Decimal],
    period: int,
) -> Decimal:
    true_ranges = []
    for index in range(1, len(closes)):
        true_ranges.append(
            max(
                highs[index] - lows[index],
                abs(highs[index] - closes[index - 1]),
                abs(lows[index] - closes[index - 1]),
            )
        )
    window = true_ranges[-period:] if len(true_ranges) >= period else true_ranges
    return sum(window) / Decimal(len(window)) if window else Decimal("0")


def _direction(
    move_percent: Decimal,
    ema20: Decimal,
    ema50: Decimal,
    macd_hist: Decimal,
) -> str:
    if abs(move_percent) < Decimal("0.35") and abs(ema20 - ema50) < abs(ema50) * Decimal("0.0015"):
        return "sideways"
    if ema20 > ema50 and macd_hist >= 0:
        return "up"
    if ema20 < ema50 and macd_hist <= 0:
        return "down"
    return "mixed"


def _alignment(direction: str, side: str | None) -> str:
    if direction in {"sideways", "mixed"} or side not in {"Buy", "Sell"}:
        return "neutral"
    if (side == "Buy" and direction == "up") or (side == "Sell" and direction == "down"):
        return "with_position"
    return "against_position"


def _summary(
    direction: str,
    alignment: str,
    rsi: Decimal,
    volume_ratio: Decimal,
) -> str:
    direction_text = {
        "up": "тренд вверх",
        "down": "тренд вниз",
        "sideways": "боковик",
        "mixed": "смешанная структура",
    }.get(direction, "нет сигнала")
    pressure = "перегрев" if rsi >= 70 else "перепроданность" if rsi <= 30 else "RSI нейтрален"
    volume = "объем выше среднего" if volume_ratio >= Decimal("1.25") else "объем спокойный"
    if alignment == "against_position":
        return f"{direction_text}; против позиции, {pressure}, {volume}."
    if alignment == "with_position":
        return f"{direction_text}; движение помогает позиции, {pressure}, {volume}."
    return f"{direction_text}; {pressure}, {volume}."


def _consensus_summary(direction: str, alignment: str) -> str:
    direction_text = {
        "up": "старшие и младшие интервалы склоняются вверх",
        "down": "старшие и младшие интервалы склоняются вниз",
        "mixed": "по интервалам нет единого направления",
    }.get(direction, "консенсус не определен")
    if alignment == "against_position":
        return f"{direction_text}; это против текущей позиции."
    if alignment == "with_position":
        return f"{direction_text}; это помогает текущей позиции."
    return f"{direction_text}; действуй от риска."


def _orderbook_side(levels: list, side: str) -> list[dict[str, Any]]:
    result = []
    for item in levels:
        if len(item) < 2:
            continue
        price = Decimal(str(item[0]))
        size = Decimal(str(item[1]))
        result.append(
            {
                "price": price,
                "size": size,
                "notional": price * size,
                "side": side,
                "label": "поддержка" if side == "bid" else "сопротивление",
            }
        )
    return result


def _optional_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))
