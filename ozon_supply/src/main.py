"""Оркестратор: --run weekly | daily-alert | monthly-procurement | --collect."""
import argparse
import sys
from datetime import date, timedelta
from pathlib import Path
import uuid

import pandas as pd

from src.config import CFG
from src.db import init_db, get_connection
from src.logger import get_logger

log = get_logger("main")


def _next_friday() -> date:
    today = date.today()
    days_ahead = (4 - today.weekday()) % 7  # 4 = Friday
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


def run_weekly(run_id: str) -> None:
    log.info("=== Weekly run started (run_id=%s) ===", run_id)
    from src.config import get_ozon_credentials
    from src.ozon_api import OzonClient
    from src.sources.catalog import load_catalog, get_gspread_client
    from src.sources.stocks_ozon import fetch_stocks, save_stocks_to_db
    from src.sources.orders_csv import load_orders, save_orders_to_db
    from src.sources.orders_api import fetch_orders_by_sku
    from src.logic.velocity import compute_velocity
    from src.logic.demand import compute_demand
    from src.logic.allocation import allocate
    from src.sinks.gsheet_plan import write_plan, write_plan_view, write_log
    from src.sinks.telegram_bot import send_weekly_summary

    gc = get_gspread_client()
    catalog = load_catalog(gc)

    client_id, api_key = get_ozon_credentials("sergashov")
    client = OzonClient(client_id, api_key)

    ship_date = _next_friday()

    # Список SKU из каталога (API /v1/analytics/stocks требует skus обязательно)
    # Исключаем архив и временно недоступные — они не участвуют в плане поставки
    active_catalog = catalog[catalog.get("status", "active") == "active"] if "status" in catalog.columns else catalog
    catalog_skus = active_catalog["SKU_Ozon"].dropna().astype(str).str.strip()
    catalog_skus = catalog_skus[catalog_skus != ""].tolist()
    log.info("Active catalog SKUs for supply planning: %d (excluded %d archived/temp_out)",
             len(catalog_skus), len(catalog) - len(active_catalog))

    with get_connection() as conn:
        # 1. Остатки Ozon
        stocks = fetch_stocks(client, skus=catalog_skus)
        save_stocks_to_db(stocks, run_id, conn)

        # 2. Заказы: предпочитаем API, fallback на CSV
        # API (/v1/analytics/data) автоматически фильтрует по аккаунту продавца,
        # но не даёт кластер доставки. CSV даёт кластер, но требует ручной загрузки.
        orders_dir = Path("data/orders")
        csv_files = sorted(orders_dir.glob("*.csv"))
        known_skus = set(catalog["SKU_Ozon"].astype(str)) | set(catalog["ШК"].astype(str))

        try:
            orders = fetch_orders_by_sku(client)
            log.info("Orders loaded from API: %d rows", len(orders))
        except Exception as e:
            log.warning("API orders failed (%s), falling back to CSV", e)
            orders = pd.DataFrame()

        # Приоритет у CSV: он даёт кластеры доставки, что важно для распределения
        # Используем CSV если он есть И (API вернул 0 строк ИЛИ CSV покрывает наши SKU)
        if csv_files:
            try:
                csv_orders = load_orders(csv_files[-1], known_skus=known_skus)
                csv_skus = set(csv_orders["sku"].unique())
                has_our_skus = len(csv_skus & known_skus) > 0
                api_empty = len(orders) == 0

                if api_empty or has_our_skus:
                    log.info(
                        "Using CSV orders (api_empty=%s, csv_known_skus=%d, has_cluster_data=True)",
                        api_empty, len(csv_skus & known_skus),
                    )
                    orders = csv_orders
            except Exception as e:
                log.warning("CSV load failed: %s", e)

        if len(orders) == 0:
            raise FileNotFoundError("No orders from API or CSV — cannot compute demand")

        save_orders_to_db(orders, run_id, conn)

    # 3. Velocity
    velocity = compute_velocity(orders)

    # 4. Маппинг склад → кластер из конфига
    wh_map: dict = CFG.get("warehouse_clusters", {})

    # 5. Расчёт потребности (только активные позиции)
    demand = compute_demand(velocity, stocks, active_catalog, wh_map)

    # 6. Остатки цеха (последний xlsx)
    factory_dir = Path("data/stocks_factory")
    xlsx_files = sorted(factory_dir.glob("*.xlsx"))
    factory_stocks: dict[str, float] = {}
    if xlsx_files:
        from src.sources.stocks_factory import load_factory_stocks, save_factory_stocks_to_db
        bom: dict = CFG.get("bom", {})
        fact_df = load_factory_stocks(xlsx_files[-1], bom=bom if bom else None)
        with get_connection() as conn:
            save_factory_stocks_to_db(fact_df, run_id, conn)
        # Строим словарь name_lower → ШК один раз (O(n), не O(n²))
        # Используем только штучные позиции для аллокации
        pcs_df = fact_df[fact_df["unit"] == "pcs"] if "unit" in fact_df.columns else fact_df

        # Строим два словаря имён → ШК:
        # 1. по Название_цех (точный/сокращённый псевдоним)
        #    Поддерживаем несколько псевдонимов через ";" (например, "имя_1С; имя_1С_2")
        name_to_bk: dict[str, str] = {}
        # 2. по Название_Ozon (полное название с Ozon)
        ozon_name_to_bk: dict[str, str] = {}
        for _, cat_row in catalog.iterrows():
            bk = str(cat_row["ШК"])
            цех = str(cat_row.get("Название_цех", "")).strip()
            ozon = str(cat_row.get("Название_Ozon", "")).strip()
            if цех and цех not in ("", "nan"):
                # Поддержка нескольких псевдонимов через ";"
                for alias in цех.split(";"):
                    alias = alias.strip()
                    if alias:
                        name_to_bk[alias.lower()] = bk
            if ozon and ozon not in ("", "nan"):
                ozon_name_to_bk[ozon.lower()] = bk

        import re as _re

        def _normalize(s: str) -> str:
            """Убираем знаки препинания, кавычки, заменяем _ и / пробелами,
            приводим к нижнему регистру."""
            s = _re.sub(r'[_/]', ' ', s)
            return _re.sub(r'[^\w\s]', ' ', s).lower()

        def _sig_words(s: str, min_len: int = 3) -> list[str]:
            """Значимые слова строки (≥ min_len символов)."""
            return [w for w in _normalize(s).split() if len(w) >= min_len]

        def _overlap_score(a_words: list[str], b_str: str) -> int:
            """Количество слов из a_words, найденных в строке b_str (substring)."""
            b = _normalize(b_str)
            return sum(1 for w in a_words if w in b)

        def _fuzzy_match_barcode(factory_name: str) -> str | None:
            """Сопоставляет имя из 1С с ШК каталога.

            Порядок поиска:
            1. Точное совпадение с Название_цех
            2. Нечёткое по Название_цех: все значимые слова каталога ≥3 букв есть в factory
               + выбираем наиболее специфичный матч (больше слов = лучше)
            3. Перекрёст по Название_Ozon: слова factory ищем в ozon_name
               порог: hits >= 2 и ratio >= 0.5 (для коротких) или hits >= 3 и >= 0.55 (длинных)
            """
            fname_norm = _normalize(factory_name)
            f_words = _sig_words(factory_name)

            # 1. Точное совпадение (Название_цех)
            if fname_norm.strip() in name_to_bk:
                return name_to_bk[fname_norm.strip()]

            # 2. Нечёткое по Название_цех: ВСЕ слова каталога есть в factory
            # Выбираем наиболее специфичный (наибольшее кол-во совпавших слов каталога)
            best_match: str | None = None
            best_score = 0
            for cat_name, barcode in name_to_bk.items():
                cat_words = _sig_words(cat_name)
                if not cat_words:
                    continue
                hits = sum(1 for w in cat_words if w in fname_norm)
                score = hits / len(cat_words)
                if score >= 1.0 and len(cat_words) > best_score:
                    best_score = len(cat_words)
                    best_match = barcode
            if best_match:
                return best_match

            # 3. По Название_Ozon: ищем factory-слова в ozon-названии
            # Адаптивный порог: для коротких factory-имён требуем >= 2 совпадений
            best_overlap = 0
            best_match2: str | None = None
            min_hits = 2 if len(f_words) <= 3 else 3
            min_ratio = 0.5 if len(f_words) <= 3 else 0.55
            for ozon_name, barcode in ozon_name_to_bk.items():
                if not f_words:
                    continue
                hits = _overlap_score(f_words, ozon_name)
                if hits >= min_hits and hits / len(f_words) >= min_ratio and hits > best_overlap:
                    best_overlap = hits
                    best_match2 = barcode
            return best_match2

        matched = 0
        for _, row in pcs_df.iterrows():
            fname = str(row["name_factory"])
            bc = _fuzzy_match_barcode(fname)
            if bc:
                factory_stocks[bc] = factory_stocks.get(bc, 0) + float(row["quantity"])
                matched += 1
            else:
                log.debug("Factory item not matched to catalog: %s", fname)
        log.info("Factory stocks matched: %d/%d pcs items → %d unique barcodes",
                 matched, len(pcs_df), len(factory_stocks))
    else:
        log.warning("No factory stock files found, allocation will use unlimited stock")

    # 7. Аллокация
    allocated = allocate(demand, factory_stocks)

    # 8. Считаем factory_remaining и days_after для отображения в плане
    total_allocated_by_bk = (
        allocated.groupby("ШК")["allocated_qty"].sum().to_dict()
        if "ШК" in allocated.columns else {}
    )
    allocated["factory_remaining"] = allocated["ШК"].map(
        lambda bk: factory_stocks.get(str(bk), 0) - total_allocated_by_bk.get(bk, 0)
        if bk else 0
    )
    allocated["days_after"] = allocated.apply(
        lambda r: (r.get("effective_stock", 0) + r["allocated_qty"]) / r["avg_daily_sales"]
        if r["avg_daily_sales"] > 0 else float("inf"),
        axis=1,
    ).clip(upper=999)

    # 9. Запись в Google Sheet
    write_plan(allocated, ship_date, run_id, gc)
    write_plan_view(allocated, ship_date, run_id, gc)

    # 9. Telegram-сводка
    filtered = allocated[allocated["allocated_qty"] > 0]
    send_weekly_summary(
        ship_date=ship_date,
        clusters=filtered["cluster"].nunique(),
        boxes=int((filtered["allocated_qty"] / filtered["Кратность"]).sum()),
        skus=len(filtered),
        critical=int(filtered["is_critical"].sum()),
    )

    write_log(run_id, "OK", f"ship_date={ship_date}", gc)
    log.info("=== Weekly run complete ===")


def run_daily_alert(run_id: str) -> None:
    log.info("=== Daily alert run (run_id=%s) ===", run_id)
    from src.config import get_ozon_credentials
    from src.ozon_api import OzonClient
    from src.sources.catalog import load_catalog, get_gspread_client
    from src.sources.stocks_ozon import fetch_stocks
    from src.logic.velocity import compute_velocity
    from src.logic.demand import compute_demand
    from src.sinks.telegram_bot import send_daily_alert

    gc = get_gspread_client()
    catalog = load_catalog(gc)
    client_id, api_key = get_ozon_credentials("sergashov")
    client = OzonClient(client_id, api_key)
    catalog_skus = catalog["SKU_Ozon"].dropna().astype(str).str.strip()
    catalog_skus = catalog_skus[catalog_skus != ""].tolist()
    stocks = fetch_stocks(client, skus=catalog_skus)
    wh_map: dict = CFG.get("warehouse_clusters", {})

    orders_dir = Path("data/orders")
    csv_files = sorted(orders_dir.glob("*.csv"))
    if not csv_files:
        log.warning("No order files for daily alert")
        return
    from src.sources.orders_csv import load_orders
    known_skus = set(catalog["SKU_Ozon"].astype(str)) | set(catalog["ШК"].astype(str))
    orders = load_orders(csv_files[-1], legal_entity="ИП Сергашов", known_skus=known_skus)
    velocity = compute_velocity(orders)
    demand = compute_demand(velocity, stocks, catalog, wh_map)

    critical = demand[demand["days_of_stock"] < CFG["defaults"]["critical_days_threshold"]]
    items = []
    for _, r in critical.iterrows():
        items.append({
            "name": r.get("Название_Ozon", r.get("sku", "")),
            "cluster": r.get("cluster", ""),
            "days": r.get("days_of_stock", 0),
        })
    send_daily_alert(items)


def run_collect(run_id: str) -> None:
    """Только сбор данных, без расчётов — для отладки."""
    log.info("=== Collect run (run_id=%s) ===", run_id)
    from src.config import get_ozon_credentials
    from src.ozon_api import OzonClient
    from src.sources.catalog import load_catalog, get_gspread_client
    from src.sources.stocks_ozon import fetch_stocks, save_stocks_to_db
    from src.sources.orders_csv import load_orders, save_orders_to_db

    gc = get_gspread_client()
    catalog = load_catalog(gc)

    client_id, api_key = get_ozon_credentials("sergashov")
    client = OzonClient(client_id, api_key)

    catalog_skus = catalog["SKU_Ozon"].dropna().astype(str).str.strip()
    catalog_skus = catalog_skus[catalog_skus != ""].tolist()

    with get_connection() as conn:
        stocks = fetch_stocks(client, skus=catalog_skus)
        save_stocks_to_db(stocks, run_id, conn)

        orders_dir = Path("data/orders")
        csv_files = sorted(orders_dir.glob("*.csv"))
        if csv_files:
            orders = load_orders(csv_files[-1])   # collect — без фильтра, все строки
            save_orders_to_db(orders, run_id, conn)

        factory_dir = Path("data/stocks_factory")
        xlsx_files = sorted(factory_dir.glob("*.xlsx"))
        if xlsx_files:
            try:
                from src.sources.stocks_factory import load_factory_stocks, save_factory_stocks_to_db
                fact_df = load_factory_stocks(xlsx_files[-1])
                save_factory_stocks_to_db(fact_df, run_id, conn)
            except ValueError as e:
                log.warning("Factory stock file skipped (likely template): %s", e)

    log.info("Collect complete")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ozon Supply Assistant")
    parser.add_argument("--run", choices=["weekly", "daily-alert", "monthly-procurement",
                                          "supply-create", "full"],
                        help="Run type")
    parser.add_argument("--collect", action="store_true",
                        help="Only collect data (no calculations)")
    parser.add_argument("--api", action="store_true",
                        help="Use Ozon API for supply-create (creates supply in Ozon LK)")
    parser.add_argument("--ship-date", type=str, default=None,
                        help="Дата поставки YYYY-MM-DD (default: +14 дней)")
    args = parser.parse_args()

    init_db()
    run_id = f"{date.today().isoformat()}_{uuid.uuid4().hex[:8]}"

    try:
        if args.collect:
            run_collect(run_id)
        elif args.run == "weekly":
            run_weekly(run_id)
        elif args.run == "daily-alert":
            run_daily_alert(run_id)
        elif args.run == "monthly-procurement":
            log.info("Monthly procurement not yet implemented (Stage 6)")
        elif args.run == "supply-create":
            from src.auto.supply_creator import run_full_supply
            run_full_supply(run_id, use_api=args.api,
                            ship_date_str=getattr(args, "ship_date", None))
        elif args.run == "full":
            from src.auto.supply_creator import run_full_supply
            run_full_supply(run_id, use_api=True,
                            ship_date_str=getattr(args, "ship_date", None))
        else:
            parser.print_help()
            sys.exit(1)
    except Exception as exc:
        log.exception("Fatal error in run_id=%s: %s", run_id, exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
