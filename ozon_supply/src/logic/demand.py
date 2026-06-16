"""Расчёт дефицита и предложения заявки на поставку.

Архитектура:
- velocity: продажи/день по (sku × кластер_доставки) — сигнал спроса по регионам
- stock:    суммарный остаток по sku на всех FBO-складах
- дефицит считается на уровне SKU, затем делится по кластерам
  пропорционально доле продаж (это развязывает несовпадение названий складов
  в stock API и кластеров доставки в orders CSV)
"""
import math
import pandas as pd
from src.config import CFG
from src.logger import get_logger

log = get_logger(__name__)

TARGET_DAYS = CFG["defaults"]["target_stock_days"]
CRITICAL_DAYS = CFG["defaults"]["critical_days_threshold"]

_CAT_COLS = ["ШК", "Кратность", "Целевой_запас_дней", "Название_цех", "Название_Ozon"]


def _merge_catalog(df: pd.DataFrame, cat: pd.DataFrame) -> pd.DataFrame:
    """Присоединяем каталог по SKU_Ozon, для незамэпленных — по ШК."""
    by_sku = df.merge(
        cat[["SKU_Ozon"] + _CAT_COLS].rename(columns={"SKU_Ozon": "sku"}),
        on="sku", how="left",
    )
    no_match = by_sku["Кратность"].isna()
    if no_match.any():
        patch = df[no_match].merge(
            cat[_CAT_COLS].rename(columns={"ШК": "sku"}),
            on="sku", how="left",
        )
        for col in _CAT_COLS:
            # "ШК" был переименован в "sku" при merge
            src_col = "sku" if col == "ШК" else col
            by_sku.loc[no_match, col] = patch[src_col].values
    return by_sku


def compute_demand(
    velocity: pd.DataFrame,
    stocks_ozon: pd.DataFrame,
    catalog: pd.DataFrame,
    warehouse_cluster_map: dict | None = None,   # не используется, оставлен для совместимости
) -> pd.DataFrame:
    """
    Вход:
      velocity    — [sku, cluster, avg_daily_sales, low_confidence]
      stocks_ozon — [sku, warehouse_name, free_to_sell, in_transit]
      catalog     — [ШК, SKU_Ozon, Кратность, Целевой_запас_дней, Название_цех, ...]

    Выход: строка на (sku × cluster) с колонками:
      order_qty, allocated_qty, is_critical, days_of_stock, ...
    """
    # ── нормализация типов ──────────────────────────────────────────────────
    velocity = velocity.copy()
    velocity["sku"] = velocity["sku"].astype(str).str.strip()

    stocks_ozon = stocks_ozon.copy()
    stocks_ozon["sku"] = stocks_ozon["sku"].astype(str).str.strip()

    cat = catalog.copy()
    cat["SKU_Ozon"] = cat["SKU_Ozon"].astype(str).str.strip()
    cat["ШК"] = cat["ШК"].astype(str).str.strip()
    # Убираем дублирующиеся SKU_Ozon (ошибка данных в каталоге)
    dup_mask = cat.duplicated("SKU_Ozon", keep="first")
    if dup_mask.any():
        log.warning("Duplicate SKU_Ozon in catalog (keeping first): %s",
                    cat.loc[dup_mask, "ШК"].tolist())
        cat = cat[~dup_mask]

    # ── 1. Суммарный остаток по SKU (все склады) ───────────────────────────
    sku_stock = (
        stocks_ozon
        .groupby("sku")
        .agg(total_stock=("free_to_sell", "sum"), in_transit=("in_transit", "sum"))
        .reset_index()
    )
    sku_stock["effective_stock"] = sku_stock["total_stock"] + sku_stock["in_transit"]

    # ── 2. Суммарная velocity по SKU (все кластеры) ────────────────────────
    sku_vel = (
        velocity.groupby("sku")["avg_daily_sales"]
        .sum()
        .reset_index()
        .rename(columns={"avg_daily_sales": "total_daily_sales"})
    )
    low_conf = velocity.groupby("sku")["low_confidence"].max().reset_index()

    # ── 3. SKU-уровень: stock + velocity + каталог ─────────────────────────
    sku_data = sku_vel.merge(sku_stock, on="sku", how="left")
    sku_data["effective_stock"] = sku_data["effective_stock"].fillna(0)
    sku_data = sku_data.merge(low_conf, on="sku", how="left")
    sku_data["low_confidence"] = sku_data["low_confidence"].fillna(False)

    sku_data = _merge_catalog(sku_data, cat)
    sku_data["Целевой_запас_дней"] = sku_data["Целевой_запас_дней"].fillna(TARGET_DAYS)
    sku_data["Кратность"] = sku_data["Кратность"].fillna(1).astype(int)

    # ── 4. Дефицит на SKU-уровне ───────────────────────────────────────────
    sku_data["days_of_stock"] = sku_data.apply(
        lambda r: r["effective_stock"] / r["total_daily_sales"]
        if r["total_daily_sales"] > 0 else float("inf"),
        axis=1,
    )
    sku_data["deficit_units"] = (
        (sku_data["Целевой_запас_дней"] - sku_data["days_of_stock"])
        * sku_data["total_daily_sales"]
    ).clip(lower=0)
    sku_data["total_order_qty"] = sku_data.apply(
        lambda r: math.ceil(r["deficit_units"] / r["Кратность"]) * r["Кратность"]
        if r["deficit_units"] > 0 else 0,
        axis=1,
    )
    sku_data["is_critical"] = sku_data["days_of_stock"] < CRITICAL_DAYS

    # ── 5. Доля каждого кластера в продажах SKU ────────────────────────────
    cluster_shares = velocity.merge(
        velocity.groupby("sku")["avg_daily_sales"].sum().rename("sku_total"),
        on="sku",
    )
    cluster_shares["share"] = cluster_shares.apply(
        lambda r: r["avg_daily_sales"] / r["sku_total"] if r["sku_total"] > 0 else 0,
        axis=1,
    )

    # ── 6. Объединяем: кластер × SKU-данные ───────────────────────────────
    result = cluster_shares.merge(
        sku_data[["sku", "ШК", "Кратность", "Целевой_запас_дней",
                  "days_of_stock", "total_order_qty", "is_critical",
                  "effective_stock", "total_daily_sales",
                  "Название_цех", "Название_Ozon", "low_confidence"]],
        on="sku", how="left",
    )

    # ── 7. Распределяем total_order_qty по кластерам (кратность!) ─────────
    def _calc_order_qty(r) -> int:
        try:
            krat = float(r["Кратность"]) or 1
            raw = float(r["total_order_qty"]) * float(r["share"])
            return int(math.floor(raw / krat) * krat)
        except (TypeError, ValueError, ZeroDivisionError):
            return 0

    result["order_qty"] = result.apply(_calc_order_qty, axis=1).astype(int)

    # Остаток от округления — в самый крупный кластер SKU
    for sku, grp in result.groupby("sku"):
        planned = grp["order_qty"].sum()
        target = int(grp["total_order_qty"].iloc[0])
        krat = int(grp["Кратность"].iloc[0]) or 1
        remainder = math.floor((target - planned) / krat) * krat
        if remainder > 0:
            top_idx = grp["avg_daily_sales"].idxmax()
            result.at[top_idx, "order_qty"] += remainder

    result["allocated_qty"] = result["order_qty"]

    n_positions = len(result[result["order_qty"] > 0])
    n_critical = result.groupby("sku")["is_critical"].first().sum()
    log.info("Demand computed: %d positions across %d (sku×cluster), %d critical SKUs",
             n_positions, len(result), n_critical)
    return result
