"""Получение истории заказов через /v1/analytics/data (Seller API).

Преимущества перед CSV:
- Не нужно вручную скачивать выгрузку
- Автоматически фильтруется по аккаунту продавца
- Гибкие dimension/metrics

Ограничения:
- Последние 3 дня недоступны — данные появляются с задержкой
- Глубже 1 месяца — только при Premium (по неделям, dimension='week')
- Кластер доставки НЕ является стандартным dimension — используем 'warehouse'
  (склад отгрузки) и маппим на кластер через warehouse_cluster_map
"""
from datetime import date, timedelta
import pandas as pd
from src.ozon_api import OzonClient
from src.logger import get_logger

log = get_logger(__name__)

# Метрики которые нам нужны
METRICS = ["ordered_units"]

# Группировка: по SKU и дню (чтобы потом посчитать velocity)
DIMENSIONS_DAILY = ["sku", "day"]

# Группировка по SKU и складу (для понимания откуда отгружают)
DIMENSIONS_BY_WH = ["sku", "warehouse"]


def fetch_orders_by_sku(
    client: OzonClient,
    days: int = 28,
    as_of: date | None = None,
) -> pd.DataFrame:
    """
    Загружает суточные продажи по SKU за последние `days` дней.
    Возвращает DataFrame [order_date, sku, quantity, cluster='unknown'].

    Примечание: /v1/analytics/data не возвращает кластер доставки напрямую.
    Для кластерного анализа используй CSV-выгрузку или дополни маппингом по складу.
    """
    if as_of is None:
        as_of = date.today()

    date_from = as_of - timedelta(days=days)
    # Данные за последние 3 дня недоступны в analytics/data
    date_to = as_of - timedelta(days=3)

    rows = client.get_analytics_data(
        date_from=date_from,
        date_to=date_to,
        dimensions=DIMENSIONS_DAILY,
        metrics=METRICS,
    )

    if not rows:
        log.warning("No analytics data returned for %s..%s", date_from, date_to)
        return pd.DataFrame(columns=["order_date", "sku", "quantity", "cluster", "warehouse"])

    records = []
    for row in rows:
        # API возвращает dimensions в том же порядке, что запрошены:
        # [0] = sku (id = числовой SKU, name = название товара)
        # [1] = day (id = "YYYY-MM-DD", name = "")
        dim_list = row.get("dimensions", [])
        sku = dim_list[0]["id"] if len(dim_list) > 0 else ""
        day = dim_list[1]["id"] if len(dim_list) > 1 else ""
        metrics_vals = row.get("metrics", [])
        qty = int(metrics_vals[0]) if metrics_vals else 0
        records.append({
            "order_date": pd.to_datetime(day, errors="coerce"),
            "sku": str(sku).strip(),
            "quantity": qty,
            "cluster": "all",      # analytics/data не даёт кластер доставки
            "warehouse": "",
            "legal_entity": "api",
        })

    df = pd.DataFrame(records).dropna(subset=["order_date"])
    log.info("Fetched %d daily sku-rows from analytics/data (%s..%s)",
             len(df), date_from, date_to)
    return df


def fetch_orders_by_warehouse(
    client: OzonClient,
    days: int = 28,
    as_of: date | None = None,
) -> pd.DataFrame:
    """
    Загружает продажи по SKU × склад — для маппинга на кластеры.
    Используется как дополнение к fetch_orders_by_sku для кластерного split.
    """
    if as_of is None:
        as_of = date.today()

    date_from = as_of - timedelta(days=days)
    date_to = as_of - timedelta(days=3)

    rows = client.get_analytics_data(
        date_from=date_from,
        date_to=date_to,
        dimensions=DIMENSIONS_BY_WH,
        metrics=METRICS,
    )

    records = []
    for row in rows:
        # dimensions: [0]=sku (id=числовой SKU), [1]=warehouse (id=название склада)
        dim_list = row.get("dimensions", [])
        sku = dim_list[0]["id"] if len(dim_list) > 0 else ""
        warehouse = dim_list[1]["id"] if len(dim_list) > 1 else ""
        qty = int(row.get("metrics", [0])[0])
        records.append({
            "sku": str(sku).strip(),
            "warehouse": warehouse,
            "quantity": qty,
        })

    df = pd.DataFrame(records)
    log.info("Fetched %d sku×warehouse rows from analytics/data", len(df))
    return df
