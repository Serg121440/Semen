"""HTTP-клиент Ozon Seller API.

Аутентификация: Client-Id + Api-Key в заголовках (OAuth не нужен).
Base URL: https://api-seller.ozon.ru
Performance API (performance.ozon.ru) — только реклама, здесь не используется.
"""
import time
from datetime import date, timedelta
from src.logger import get_logger

import requests

log = get_logger(__name__)

OZON_API_URL = "https://api-seller.ozon.ru"


class OzonClient:
    def __init__(self, client_id: str, api_key: str):
        self.session = requests.Session()
        self.session.headers.update({
            "Client-Id": client_id,
            "Api-Key": api_key,
            "Content-Type": "application/json",
        })

    def post(self, path: str, body: dict, *, retries: int = 5) -> dict:
        url = OZON_API_URL + path
        for attempt in range(retries):
            try:
                log.debug("POST %s", path)
                resp = self.session.post(url, json=body, timeout=30)
                resp.raise_for_status()
                return resp.json()
            except requests.HTTPError as e:
                if e.response is not None and e.response.status_code == 429:
                    wait = 5 * (2 ** attempt)   # 5s, 10s, 20s, 40s, 80s
                    log.warning("Rate limited on %s, retry in %ds (attempt %d/%d)",
                                path, wait, attempt + 1, retries)
                    time.sleep(wait)
                    continue
                raise
        raise RuntimeError(f"Failed after {retries} retries: POST {path}")

    # ─────────────────────────────────────────────────────────────────────────
    # Остатки FBO  /v1/analytics/stocks
    # Возвращает: result.rows[] с полями: item_id (=SKU), warehouse_id,
    #   warehouse_name, free_to_sell_amount, reserved_amount, predicted_supply_amount
    # ─────────────────────────────────────────────────────────────────────────
    def get_analytics_stocks(
        self,
        skus: list[int | str] | None = None,
        warehouse_ids: list[int] | None = None,
    ) -> dict:
        """Остатки FBO по кластерам через /v1/analytics/stocks.

        Реальный формат ответа: {"items": [...]} где каждый элемент содержит:
          sku, name, offer_id, warehouse_id, warehouse_name,
          cluster_id, cluster_name,            ← кластер доставки прямо здесь!
          available_stock_count,                ← свободно к продаже
          transit_stock_count,                  ← в пути
          requested_stock_count,                ← запрошено к поставке
          turnover_grade, ads, days_without_sales, ...

        API требует непустой список skus. Делаем батчи по 100. Endpoint похоже
        возвращает все товары аккаунта независимо от переданных SKU — дедuplицируем.
        """
        if not skus:
            log.warning("get_analytics_stocks: skus list is empty, returning empty result")
            return {"items": []}

        # Конвертируем все SKU в int (API ожидает числа)
        int_skus: list[int] = []
        for s in skus:
            try:
                int_skus.append(int(s))
            except (ValueError, TypeError):
                pass

        BATCH = 100
        seen_keys: set = set()
        all_items: list = []
        total_batches = (len(int_skus) + BATCH - 1) // BATCH
        for i in range(0, len(int_skus), BATCH):
            batch = int_skus[i: i + BATCH]
            body: dict = {"skus": batch}
            if warehouse_ids:
                body["warehouse_ids"] = warehouse_ids
            resp = self.post("/v1/analytics/stocks", body)
            items = resp.get("items", [])
            prev_count = len(all_items)
            # дедупликация — endpoint может вернуть одно и то же для разных батчей
            for item in items:
                key = (item.get("sku"), item.get("cluster_id"), item.get("warehouse_id"))
                if key not in seen_keys:
                    seen_keys.add(key)
                    all_items.append(item)
            log.info("Stocks batch %d/%d: %d items (total unique %d)",
                     i // BATCH + 1, total_batches, len(items), len(all_items))
            # Если батч не добавил новых данных — API уже вернул всё, дальше не идём
            if len(all_items) == prev_count and prev_count > 0:
                log.info("Stocks: no new items in batch, API returned full data — stopping")
                break
            if i + BATCH < len(int_skus):
                time.sleep(5)   # пауза между батчами чтобы не попасть под rate-limit

        log.info("Total unique FBO stock items: %d", len(all_items))
        return {"items": all_items}

    # ─────────────────────────────────────────────────────────────────────────
    # Аналитика продаж  /v1/analytics/data
    # Заменяет CSV-выгрузку «Заказы». Ограничения:
    #   - последние 3 дня недоступны (используем date_to = today - 3)
    #   - глубже 1 месяца — только при Premium (по неделям)
    # dimensions: sku, day, week, month, warehouse, delivery_schema, ...
    # metrics: ordered_units, revenue, returns, ...
    # ─────────────────────────────────────────────────────────────────────────
    def get_analytics_data(
        self,
        date_from: date,
        date_to: date,
        dimensions: list[str],
        metrics: list[str],
        filters: list[dict] | None = None,
        limit: int = 1000,
    ) -> list[dict]:
        """Агрегированная аналитика. Возвращает список строк result.data."""
        # API не отдаёт данные за последние 3 дня
        safe_to = min(date_to, date.today() - timedelta(days=3))
        if safe_to < date_from:
            log.warning("analytics/data: date range falls in 3-day blackout, returning empty")
            return []

        all_rows: list = []
        offset = 0
        while True:
            body: dict = {
                "date_from": date_from.strftime("%Y-%m-%d"),
                "date_to": safe_to.strftime("%Y-%m-%d"),
                "dimension": dimensions,
                "metrics": metrics,
                "limit": limit,
                "offset": offset,
            }
            if filters:
                body["filters"] = filters
            resp = self.post("/v1/analytics/data", body)
            rows = resp.get("result", {}).get("data", [])
            all_rows.extend(rows)
            if len(rows) < limit:
                break
            offset += limit
        log.info("analytics/data: %d rows (%s → %s)", len(all_rows), date_from, safe_to)
        return all_rows

    # ─────────────────────────────────────────────────────────────────────────
    # Склады  /v1/warehouse/list
    # ─────────────────────────────────────────────────────────────────────────
    def get_warehouses(self) -> list[dict]:
        resp = self.post("/v1/warehouse/list", {})
        return resp.get("result", [])

    # ─────────────────────────────────────────────────────────────────────────
    # ── Этап 5: FBO поставки ─────────────────────────────────────────────────
    # Полный гайд: dev.ozon.ru/start/443
    # ─────────────────────────────────────────────────────────────────────────

    def create_supply_draft(self, body: dict) -> dict:
        """POST /v1/supply-order/draft — создать черновик заявки на поставку.

        body: {
            "supply_warehouse_id": int,   # склад Ozon
            "items": [{"sku": int, "quantity": int}, ...],
            "supply_date": "YYYY-MM-DD"   # дата отгрузки
        }
        Возвращает: {"draft_id": "..."}
        """
        return self.post("/v1/supply-order/draft", body)

    def get_supply_order(self, supply_order_id: str) -> dict:
        """POST /v2/supply-order/get — статус и данные поставки."""
        return self.post("/v2/supply-order/get", {"supply_order_id": supply_order_id})

    def create_cargoes(self, body: dict) -> dict:
        """POST /v1/cargoes/create — передать грузоместа (короба) с товарным составом."""
        return self.post("/v1/cargoes/create", body)

    def get_cargo_labels(self, cargo_id: str) -> bytes:
        """POST /v1/cargoes/label — получить PDF этикеток для грузомест."""
        url = OZON_API_URL + "/v1/cargoes/label"
        resp = self.session.post(url, json={"cargo_id": cargo_id}, timeout=30)
        resp.raise_for_status()
        return resp.content  # PDF bytes
