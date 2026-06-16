"""Распределение товара при нехватке на цеху."""
import math
import pandas as pd
from src.logger import get_logger

log = get_logger(__name__)

CRITICAL_DAYS = 7


def allocate(demand: pd.DataFrame, factory_stocks: dict[str, float]) -> pd.DataFrame:
    """
    demand: результат compute_demand с колонками [sku, cluster, order_qty, is_critical, ...]
    factory_stocks: {barcode -> available_qty}

    Возвращает demand с добавленной колонкой allocated_qty.
    """
    df = demand.copy()
    df["allocated_qty"] = 0

    # Добавляем ШК из SKU через внешний маппинг (должен быть в df)
    if "ШК" not in df.columns:
        log.warning("No 'ШК' column in demand, allocation skipped")
        df["allocated_qty"] = df["order_qty"]
        return df

    remaining = dict(factory_stocks)

    for barcode, group in df[df["order_qty"] > 0].groupby("ШК"):
        available = remaining.get(str(barcode), 0)
        total_needed = group["order_qty"].sum()

        if available >= total_needed:
            df.loc[group.index, "allocated_qty"] = group["order_qty"]
            remaining[str(barcode)] = available - total_needed
            continue

        if available <= 0:
            log.warning("No factory stock for barcode %s", barcode)
            continue

        # Сначала — критичные кластеры
        critical = group[group["is_critical"]].copy()
        normal = group[~group["is_critical"]].copy()

        budget = available
        for idx, row in critical.iterrows():
            give = min(row["order_qty"], budget)
            df.at[idx, "allocated_qty"] = give
            budget -= give
            if budget <= 0:
                break

        if budget > 0 and not normal.empty:
            total_normal = normal["order_qty"].sum()
            for idx, row in normal.iterrows():
                share = row["order_qty"] / total_normal if total_normal > 0 else 0
                raw = budget * share
                krat = int(row.get("Кратность", 1)) or 1
                give = min(row["order_qty"], math.floor(raw / krat) * krat)
                df.at[idx, "allocated_qty"] = give

        remaining[str(barcode)] = 0
        log.info("Barcode %s: needed %d, available %.0f", barcode, total_needed, available)

    return df
