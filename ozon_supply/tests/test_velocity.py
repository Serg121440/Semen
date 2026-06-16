"""Unit-тесты для logic/velocity.py."""
import pandas as pd
import pytest
from datetime import date, timedelta
from src.logic.velocity import compute_velocity


def _make_orders(rows):
    df = pd.DataFrame(rows, columns=["order_date", "sku", "quantity", "cluster", "legal_entity"])
    df["order_date"] = pd.to_datetime(df["order_date"])
    return df


TODAY = date(2024, 6, 10)


def test_normal_velocity():
    orders = _make_orders([
        (TODAY - timedelta(days=i), "SKU-1", 2, "Москва", "ИП Сергашов")
        for i in range(20)
    ])
    result = compute_velocity(orders, as_of=TODAY)
    row = result[(result["sku"] == "SKU-1") & (result["cluster"] == "Москва")].iloc[0]
    assert row["avg_daily_sales"] == pytest.approx(2.0, rel=0.01)
    assert not bool(row["low_confidence"])


def test_low_confidence_flag():
    orders = _make_orders([
        (TODAY - timedelta(days=i), "SKU-2", 5, "Сибирь", "ИП Сергашов")
        for i in range(10)  # < 14 дней
    ])
    result = compute_velocity(orders, as_of=TODAY)
    row = result[(result["sku"] == "SKU-2") & (result["cluster"] == "Сибирь")].iloc[0]
    assert bool(row["low_confidence"])


def test_zero_orders_empty_result():
    orders = _make_orders([])
    result = compute_velocity(orders, as_of=TODAY)
    assert result.empty


def test_multiple_clusters():
    orders = _make_orders([
        (TODAY - timedelta(days=i), "SKU-3", 1, "Москва", "ИП Сергашов")
        for i in range(20)
    ] + [
        (TODAY - timedelta(days=i), "SKU-3", 3, "Сибирь", "ИП Сергашов")
        for i in range(20)
    ])
    result = compute_velocity(orders, as_of=TODAY)
    assert len(result) == 2
    moscow = result[result["cluster"] == "Москва"].iloc[0]
    siberia = result[result["cluster"] == "Сибирь"].iloc[0]
    assert moscow["avg_daily_sales"] < siberia["avg_daily_sales"]
