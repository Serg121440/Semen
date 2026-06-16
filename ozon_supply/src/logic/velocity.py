"""Расчёт средних продаж/день по (ШК × кластер)."""
from datetime import date, timedelta
import pandas as pd
from src.config import CFG
from src.logger import get_logger

log = get_logger(__name__)

WINDOW = CFG["defaults"]["velocity_window_days"]
MIN_WINDOW = CFG["defaults"]["min_velocity_window_days"]


def compute_velocity(orders: pd.DataFrame, as_of: date | None = None) -> pd.DataFrame:
    """
    Вход: orders с колонками [order_date, sku, quantity, cluster, legal_entity]
    Выход: DataFrame [sku, cluster, avg_daily_sales, low_confidence]
    """
    if as_of is None:
        as_of = date.today()

    cutoff = pd.Timestamp(as_of - timedelta(days=WINDOW))
    # order_date может быть Timestamp или строкой — нормализуем
    order_dates = pd.to_datetime(orders["order_date"], errors="coerce")
    df = orders[order_dates >= cutoff].copy()
    df["order_date"] = order_dates[df.index]

    if df.empty:
        log.warning("No orders in the last %d days, velocity will be zero", WINDOW)
        return pd.DataFrame(columns=["sku", "cluster", "avg_daily_sales", "low_confidence"])

    grouped = (
        df.groupby(["sku", "cluster"])["quantity"]
        .sum()
        .reset_index()
        .rename(columns={"quantity": "total_qty"})
    )

    # Реальный горизонт данных по каждому SKU
    first_order = (
        df.groupby("sku")["order_date"]
        .min()
        .reset_index()
        .rename(columns={"order_date": "first_date"})
    )
    grouped = grouped.merge(first_order, on="sku", how="left")
    # +1: диапазон [first_date, as_of] включает обе границы
    grouped["actual_days"] = ((pd.Timestamp(as_of) - grouped["first_date"]).dt.days + 1).clip(lower=1, upper=WINDOW)

    grouped["avg_daily_sales"] = grouped["total_qty"] / grouped["actual_days"]
    grouped["low_confidence"] = grouped["actual_days"] < MIN_WINDOW

    log.info("Computed velocity for %d (sku, cluster) pairs", len(grouped))
    return grouped[["sku", "cluster", "avg_daily_sales", "low_confidence"]]
