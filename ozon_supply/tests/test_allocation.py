"""Unit-тесты для logic/allocation.py."""
import pandas as pd
from src.logic.allocation import allocate


def _demand(rows):
    return pd.DataFrame(rows, columns=["sku", "cluster", "ШК", "order_qty", "is_critical", "Кратность"])


def test_full_stock_passes_through():
    demand = _demand([("S1", "Москва", "BK1", 10, False, 5)])
    result = allocate(demand, {"BK1": 100})
    assert result.iloc[0]["allocated_qty"] == 10


def test_zero_stock_gives_zero():
    demand = _demand([("S1", "Москва", "BK1", 10, False, 5)])
    result = allocate(demand, {"BK1": 0})
    assert result.iloc[0]["allocated_qty"] == 0


def test_critical_gets_priority():
    demand = _demand([
        ("S1", "Москва",  "BK1", 20, False, 5),
        ("S1", "Сибирь",  "BK1", 20, True,  5),
    ])
    # Только 20 штук на складе — критичный получает всё
    result = allocate(demand, {"BK1": 20})
    critical_row = result[result["cluster"] == "Сибирь"].iloc[0]
    normal_row   = result[result["cluster"] == "Москва"].iloc[0]
    assert critical_row["allocated_qty"] == 20
    assert normal_row["allocated_qty"] == 0


def test_allocation_respects_multiplicity():
    """При дефиците цеха выданное количество кратно Кратности."""
    demand = _demand([
        ("S1", "Москва", "BK1", 30, False, 10),
        ("S1", "Сибирь", "BK1", 30, False, 10),
    ])
    result = allocate(demand, {"BK1": 35})
    for qty in result["allocated_qty"]:
        if qty > 0:
            assert qty % 10 == 0, f"Некратное количество: {qty}"


def test_no_bk_column_fallback():
    """Если нет колонки ШК — allocated_qty = order_qty."""
    demand = pd.DataFrame([
        {"sku": "S1", "cluster": "Москва", "order_qty": 10, "is_critical": False}
    ])
    result = allocate(demand, {})
    assert result.iloc[0]["allocated_qty"] == 10
