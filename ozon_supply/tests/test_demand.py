"""Unit-тесты для logic/demand.py."""
import math
import pandas as pd
import pytest
from src.logic.demand import compute_demand


def _velocity(rows):
    """rows: [(sku, cluster, avg_daily)]"""
    return pd.DataFrame(rows, columns=["sku", "cluster", "avg_daily_sales", "low_confidence"])


def _stock(sku, warehouse, free, in_transit=0):
    return {"sku": str(sku), "warehouse_name": warehouse,
            "free_to_sell": free, "in_transit": in_transit}


def _catalog_row(sku, krat=1, target=30):
    return {"SKU_Ozon": str(sku), "ШК": f"BK{sku}", "Кратность": krat,
            "Целевой_запас_дней": target, "Название_цех": f"name_{sku}",
            "Название_Ozon": f"Товар {sku}", "ИП": "Сергашов"}


def test_normal_demand_single_cluster():
    velocity = _velocity([("100", "Москва", 2.0, False)])
    stocks = pd.DataFrame([_stock("100", "Склад-МСК", 10)])
    catalog = pd.DataFrame([_catalog_row("100", krat=5, target=30)])
    result = compute_demand(velocity, stocks, catalog)

    row = result.iloc[0]
    # дней запаса: 10/2 = 5, дефицит: (30-5)*2 = 50, кратность 5 → 50
    assert row["total_order_qty"] == 50
    assert row["order_qty"] == 50   # один кластер — всё туда
    assert bool(row["is_critical"])  # 5 < 7


def test_no_deficit():
    velocity = _velocity([("200", "Москва", 1.0, False)])
    stocks = pd.DataFrame([_stock("200", "Склад-МСК", 60)])
    catalog = pd.DataFrame([_catalog_row("200", krat=1, target=30)])
    result = compute_demand(velocity, stocks, catalog)
    assert result.iloc[0]["order_qty"] == 0


def test_zero_sales_no_order():
    velocity = _velocity([("300", "Москва", 0.0, False)])
    stocks = pd.DataFrame([_stock("300", "Склад-МСК", 0)])
    catalog = pd.DataFrame([_catalog_row("300")])
    result = compute_demand(velocity, stocks, catalog)
    assert result.iloc[0]["order_qty"] == 0


def test_rounding_to_multiplicity():
    velocity = _velocity([("400", "Москва", 1.0, False)])
    stocks = pd.DataFrame([_stock("400", "Склад-МСК", 0)])
    catalog = pd.DataFrame([_catalog_row("400", krat=10, target=30)])
    result = compute_demand(velocity, stocks, catalog)
    assert result.iloc[0]["order_qty"] % 10 == 0
    assert result.iloc[0]["order_qty"] == 30


def test_in_transit_reduces_order():
    velocity = _velocity([("500", "Москва", 2.0, False)])
    stocks = pd.DataFrame([_stock("500", "Склад-МСК", 0, in_transit=50)])
    catalog = pd.DataFrame([_catalog_row("500", krat=1, target=30)])
    result = compute_demand(velocity, stocks, catalog)
    # effective = 50, days = 25, дефицит = (30-25)*2 = 10
    assert result.iloc[0]["order_qty"] == 10


def test_multi_cluster_split_proportional():
    """При двух кластерах заявка делится пропорционально продажам."""
    velocity = _velocity([
        ("600", "Москва",  3.0, False),
        ("600", "Сибирь",  1.0, False),
    ])
    stocks = pd.DataFrame([_stock("600", "Склад-МСК", 0)])
    catalog = pd.DataFrame([_catalog_row("600", krat=10, target=30)])
    result = compute_demand(velocity, stocks, catalog)

    # total_daily = 4, days_of_stock = 0, deficit = 30*4 = 120, total_order = 120
    assert result["total_order_qty"].iloc[0] == 120
    # Москва 75% (3/4), Сибирь 25% (1/4) → 90 и 30
    moscow = result[result["cluster"] == "Москва"].iloc[0]["order_qty"]
    siberia = result[result["cluster"] == "Сибирь"].iloc[0]["order_qty"]
    assert moscow + siberia == 120
    assert moscow % 10 == 0 and siberia % 10 == 0
    assert moscow > siberia


def test_multi_cluster_all_stock_total():
    """Сток агрегируется по всем складам."""
    velocity = _velocity([
        ("700", "Москва",  1.0, False),
        ("700", "Сибирь",  1.0, False),
    ])
    # Два склада, суммарно 40 шт → 20 дней (target=30, дефицит = 10*2 = 20)
    stocks = pd.DataFrame([
        _stock("700", "Склад-МСК",  20),
        _stock("700", "Склад-НСК",  20),
    ])
    catalog = pd.DataFrame([_catalog_row("700", krat=5, target=30)])
    result = compute_demand(velocity, stocks, catalog)
    assert result["total_order_qty"].iloc[0] == 20
