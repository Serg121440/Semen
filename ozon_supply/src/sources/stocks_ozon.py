"""Остатки FBO на складах Ozon через /v1/analytics/stocks.

Реальная структура ответа API (поле items[]):
  sku                   — числовой SKU (Ozon item_id)
  name                  — название товара
  offer_id              — артикул продавца
  warehouse_id          — ID склада (0 если агрегат по кластеру)
  warehouse_name        — название склада (пусто если агрегат)
  cluster_id            — ID кластера доставки
  cluster_name          — название кластера ("Москва", "Ростов", ...)  ← прямо в ответе!
  available_stock_count — доступно к продаже (free_to_sell)
  transit_stock_count   — в пути (in_transit)
  requested_stock_count — запрошено к поставке
  turnover_grade        — DEFICIT / SURPLUS / NORMAL / ...
  ads                   — среднедневные продажи (average daily sales)
  days_without_sales    — дней без продаж
"""
import pandas as pd
from src.ozon_api import OzonClient
from src.logger import get_logger

log = get_logger(__name__)


def fetch_stocks(client: OzonClient, skus: list | None = None) -> pd.DataFrame:
    """Возвращает DataFrame остатков по кластерам.

    Колонки: sku, warehouse_id, warehouse_name, cluster_id, cluster_name,
             free_to_sell, in_transit, requested, turnover_grade, ads_daily

    Args:
        skus: список SKU (Ozon item_id). API требует 1–100 шт на батч.
    """
    log.info("Fetching FBO stocks from Ozon API (skus=%s)", len(skus) if skus else 0)
    data = client.get_analytics_stocks(skus=skus)
    items = data.get("items", [])

    if not items:
        log.warning("Empty stocks response from Ozon API")
        return pd.DataFrame(columns=[
            "sku", "warehouse_id", "warehouse_name", "cluster_id", "cluster_name",
            "free_to_sell", "in_transit", "requested", "turnover_grade", "ads_daily",
        ])

    df = pd.DataFrame(items)

    # Нормализуем имена полей
    rename_map = {
        "available_stock_count": "free_to_sell",
        "transit_stock_count":   "in_transit",
        "requested_stock_count": "requested",
        "ads":                   "ads_daily",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    # Гарантируем наличие всех нужных колонок
    str_cols = ("sku", "warehouse_name", "cluster_name", "turnover_grade")
    int_cols = ("warehouse_id", "cluster_id", "free_to_sell", "in_transit", "requested")
    float_cols = ("ads_daily",)

    for col in str_cols:
        if col not in df.columns:
            df[col] = ""
    for col in int_cols:
        if col not in df.columns:
            df[col] = 0
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)
    for col in float_cols:
        if col not in df.columns:
            df[col] = 0.0
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["sku"] = df["sku"].astype(str).str.strip()

    log.info(
        "Fetched %d FBO stock items: %d SKUs across %d clusters",
        len(df),
        df["sku"].nunique(),
        df["cluster_name"].nunique(),
    )
    return df[[
        "sku", "warehouse_id", "warehouse_name", "cluster_id", "cluster_name",
        "free_to_sell", "in_transit", "requested", "turnover_grade", "ads_daily",
    ]]


def save_stocks_to_db(df: pd.DataFrame, run_id: str, conn) -> None:
    rows = df.copy()
    rows["run_id"] = run_id
    rows.to_sql("stocks_ozon", conn, if_exists="append", index=False)
    log.info("Saved %d ozon stock rows (run_id=%s)", len(rows), run_id)
