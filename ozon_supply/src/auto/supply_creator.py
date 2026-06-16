"""Полный цикл создания поставки — от остатков цеха до ШК грузомест.

Триггер: новый xlsx в data/stocks_factory/ → python -m src.main --run full

Шаги:
  1. Читаем остатки цеха из последнего xlsx
  2. Скачиваем остатки и потребность с Ozon (stocks API)
  3. Скачиваем заказы (API → fallback CSV)
  4. Считаем скорость продаж + дефицит по кластерам
  5. Аллоцируем из остатков цеха → скорректированные кол-ва
  6. Для каждого кластера:
       a. POST /v1/supply-order/draft  → supply_order_id
       b. POST /v1/cargoes/create      → cargo_id + ШК ГМ на каждый короб
       c. POST /v1/cargoes/label       → PDF этикеток
  7. Генерируем «Состав ГМ» xlsx с реальными ШК ГМ
  8. Генерируем сводную для цеха (Заявка_цех)
  9. Собираем ZIP-архив → output/supply_{date}/
"""
from __future__ import annotations

import io
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd

from src.config import CFG
from src.logger import get_logger

log = get_logger(__name__)

OUTPUT_DIR = Path("output")
_FOOD_ZONE = "Продукты"
_BOX_TYPE  = "Коробка"


# ─────────────────────────────────────────────────────────────────────────────
# Утилиты
# ─────────────────────────────────────────────────────────────────────────────

def _add_months(d: date, months: int) -> date:
    """Добавляет N месяцев к дате без внешних зависимостей."""
    total = d.month - 1 + months
    year  = d.year + total // 12
    month = total % 12 + 1
    import calendar
    day = min(d.day, calendar.monthrange(year, month)[1])
    return d.replace(year=year, month=month, day=day)


def expiry_date(production: date | None = None, months: int = 8) -> date:
    """Срок годности = дата производства + N месяцев."""
    return _add_months(production or date.today(), months)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Обогащение плана данными каталога
# ─────────────────────────────────────────────────────────────────────────────

def enrich_plan(approved: pd.DataFrame, catalog: pd.DataFrame) -> pd.DataFrame:
    """Добавляет к [cluster, ШК, qty] поля из каталога."""
    cat = catalog[["ШК", "SKU_Ozon", "Артикул_Ozon", "Название_Ozon", "Кратность"]].copy()
    cat["ШК"] = cat["ШК"].astype(str).str.strip()
    df = approved.copy()
    df["ШК"] = df["ШК"].astype(str).str.strip()

    df = df.merge(cat, on="ШК", how="left")
    missing = df["Кратность"].isna()
    if missing.any():
        log.warning("Catalog miss for ШК: %s", df.loc[missing, "ШК"].unique().tolist())
    df["Кратность"]    = df["Кратность"].fillna(1).astype(int)
    df["SKU_Ozon"]     = df["SKU_Ozon"].fillna("").astype(str).str.strip()
    df["Артикул_Ozon"] = df["Артикул_Ozon"].fillna("").astype(str).str.strip()
    df["Название_Ozon"] = df["Название_Ozon"].fillna(df.get("Название", "")).astype(str)

    df["boxes_full"]    = (df["qty"] // df["Кратность"]).astype(int)
    df["remainder_pcs"] = (df["qty"] % df["Кратность"]).astype(int)
    df["total_boxes"]   = df["boxes_full"] + (df["remainder_pcs"] > 0).astype(int)
    return df


# ─────────────────────────────────────────────────────────────────────────────
# 2. Создание поставок в Ozon API
# ─────────────────────────────────────────────────────────────────────────────

def _cluster_to_warehouse_id(cluster: str, wh_by_name: dict[str, int],
                              cluster_wh_map: dict[str, str] | None = None) -> int | None:
    """Ищет warehouse_id по имени кластера.

    cluster_wh_map: {кластер → склад_Ozon} — из листа «Маппинг_складов».
    wh_by_name:     {склад_Ozon → warehouse_id} — из /v1/warehouse/list API.
    """
    mapping = cluster_wh_map or CFG.get("cluster_warehouses", {})
    wh_name = mapping.get(cluster)
    if not wh_name:
        log.warning("No warehouse mapping for cluster '%s'", cluster)
        return None
    wh_id = wh_by_name.get(wh_name)
    if not wh_id:
        log.warning("Warehouse '%s' not in Ozon API list (cluster='%s')", wh_name, cluster)
    return wh_id


def create_supply_for_cluster(
    client,
    cluster: str,
    rows: pd.DataFrame,
    wh_by_name: dict[str, int],
    ship_date: date,
    prod_date: date,
    shelf_months: int = 8,
    cluster_wh_map: dict[str, str] | None = None,
) -> dict:
    """Создаёт черновик поставки и грузоместа для одного кластера.

    Возвращает:
    {
      "supply_order_id": str,
      "boxes": [
        {
          "box_num": int,
          "cargo_id": str | None,
          "shk_gm": str,          # ШК грузоместа — из ответа Ozon или placeholder
          "sku": str,
          "articul": str,
          "qty": int,
          "expiry": str,          # YYYY-MM-DD
        }, ...
      ]
    }
    """
    exp_str = expiry_date(prod_date, shelf_months).strftime("%Y-%m-%d")

    # ── a. Создаём черновик поставки ─────────────────────────────────────────
    wh_id = _cluster_to_warehouse_id(cluster, wh_by_name, cluster_wh_map)
    supply_order_id: str | None = None

    items_for_draft = []
    for _, row in rows.iterrows():
        sku = str(row["SKU_Ozon"]).strip()
        if sku and sku != "nan":
            try:
                items_for_draft.append({"sku": int(sku), "quantity": int(row["qty"])})
            except ValueError:
                pass

    if wh_id and items_for_draft:
        try:
            resp = client.create_supply_draft({
                "supply_warehouse_id": wh_id,
                "items": items_for_draft,
                "supply_date": ship_date.strftime("%Y-%m-%d"),
            })
            supply_order_id = str(
                resp.get("supply_order_id") or resp.get("draft_id") or ""
            )
            log.info("Supply draft created: cluster='%s' → supply_order_id=%s",
                     cluster, supply_order_id)
        except Exception as e:
            log.error("create_supply_draft failed for cluster='%s': %s", cluster, e)
    else:
        log.warning("Skipping API draft for cluster='%s' (wh_id=%s, items=%d)",
                    cluster, wh_id, len(items_for_draft))

    # ── b. Регистрируем грузоместа (по одному SKU на короб) ──────────────────
    boxes: list[dict] = []
    box_num = 1

    for _, row in rows.iterrows():
        sku_ozon   = str(row["SKU_Ozon"]).strip()
        shk_tovar  = f"OZN{sku_ozon}" if sku_ozon and sku_ozon != "nan" else str(row["ШК"])
        articul    = str(row["Артикул_Ozon"]).strip() or str(row["ШК"])
        krat       = int(row["Кратность"])
        remaining  = int(row["qty"])

        while remaining > 0:
            qty_in_box = min(remaining, krat)
            shk_gm     = f"BOX{box_num:06d}"   # placeholder до ответа API

            cargo_payload: dict | None = None
            if supply_order_id:
                try:
                    sku_int = int(sku_ozon) if sku_ozon and sku_ozon != "nan" else None
                    if sku_int:
                        cargo_payload = {
                            "supply_order_id": supply_order_id,
                            "cargoes": [{
                                "items": [{
                                    "sku": sku_int,
                                    "quantity": qty_in_box,
                                    "expiration_date": exp_str,
                                }]
                            }],
                        }
                        c_resp = client.create_cargoes(cargo_payload)
                        # Ozon возвращает список грузомест с баркодами
                        cargoes_out = (
                            c_resp.get("cargoes")
                            or c_resp.get("result", {}).get("cargoes", [])
                        )
                        if cargoes_out:
                            first = cargoes_out[0]
                            shk_gm = str(
                                first.get("barcode")
                                or first.get("cargo_barcode")
                                or first.get("cargo_id")
                                or shk_gm
                            )
                            log.debug("Cargo created: box#%d sku=%s shk_gm=%s",
                                      box_num, sku_int, shk_gm)
                except Exception as e:
                    log.warning("create_cargoes failed box#%d sku=%s: %s",
                                box_num, sku_ozon, e)

            boxes.append({
                "box_num":    box_num,
                "cargo_id":   None,
                "shk_gm":     shk_gm,
                "shk_tovar":  shk_tovar,
                "articul":    articul,
                "qty":        qty_in_box,
                "expiry":     exp_str,
                "cluster":    cluster,
                "sku":        sku_ozon,
                "Название":   str(row.get("Название_Ozon", "")),
            })
            remaining -= qty_in_box
            box_num   += 1

    return {"supply_order_id": supply_order_id or "", "boxes": boxes}


# ─────────────────────────────────────────────────────────────────────────────
# 3. Генерация «Состав ГМ» xlsx (формат для загрузки в Ozon ЛК)
# ─────────────────────────────────────────────────────────────────────────────

def generate_cargo_xlsx(boxes: list[dict], cluster: str, out_dir: Path | None) -> bytes:
    """Один xlsx «Состав ГМ» для кластера."""
    rows = [{
        "ШК товара":       b["shk_tovar"],
        "Артикул товара":  b["articul"],
        "Кол-во товаров":  b["qty"],
        "Зона размещения": _FOOD_ZONE,
        "Срок годности":   b["expiry"],
        "ШК ГМ":           b["shk_gm"],
        "Тип ГМ":          _BOX_TYPE,
    } for b in boxes]

    df = pd.DataFrame(rows, columns=[
        "ШК товара", "Артикул товара", "Кол-во товаров",
        "Зона размещения", "Срок годности", "ШК ГМ", "Тип ГМ",
    ])

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        df.to_excel(w, sheet_name="Состав ГМ поставки", index=False)
        ws = w.sheets["Состав ГМ поставки"]
        for col, width in zip("ABCDEFG", [22, 28, 16, 18, 16, 22, 12]):
            ws.column_dimensions[col].width = width
    buf.seek(0)
    data = buf.read()

    if out_dir:
        safe = cluster.replace(" ", "_").replace("/", "-")
        path = out_dir / f"Состав_ГМ_{safe}.xlsx"
        path.write_bytes(data)
        log.info("Saved %s (%d rows)", path.name, len(df))
    return data


# ─────────────────────────────────────────────────────────────────────────────
# 4. Сводная для цеха
# ─────────────────────────────────────────────────────────────────────────────

def generate_factory_order(all_boxes: list[dict], enriched: pd.DataFrame,
                           prod_date: date, out_dir: Path | None) -> bytes:
    """factory_order.xlsx: Сводная + По кластерам + Разбивка коробов."""
    date_str = prod_date.strftime("%d.%m.%Y")
    exp_str  = expiry_date(prod_date, 8).strftime("%d.%m.%Y")

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        # ── Сводная: суммарно по SKU ─────────────────────────────────────────
        summary = (
            enriched
            .groupby(["ШК", "Название_Ozon", "Артикул_Ozon", "Кратность"])
            .agg(Всего_шт=("qty", "sum"), Всего_коробов=("total_boxes", "sum"))
            .reset_index()
            .sort_values("Название_Ozon")
        )
        summary.insert(0, "Дата производства", date_str)
        summary.insert(1, "Срок годности до",  exp_str)
        summary.to_excel(w, sheet_name="Сводная", index=False)
        ws = w.sheets["Сводная"]
        for col, width in zip("ABCDEFGH", [18, 16, 14, 40, 18, 12, 14, 14]):
            ws.column_dimensions[col].width = width

        # ── По кластерам ─────────────────────────────────────────────────────
        detail = enriched[["cluster", "Название_Ozon", "ШК",
                            "Артикул_Ozon", "Кратность", "qty", "total_boxes"]].copy()
        detail.columns = ["Кластер", "Название", "ШК", "Артикул", "Кратность", "Штук", "Коробов"]
        detail.sort_values(["Кластер", "Название"]).to_excel(
            w, sheet_name="По кластерам", index=False)
        ws2 = w.sheets["По кластерам"]
        for col, width in zip("ABCDEFG", [28, 38, 14, 18, 10, 10, 10]):
            ws2.column_dimensions[col].width = width

        # ── Разбивка по коробам ──────────────────────────────────────────────
        # Кратность по ШК товара для пометки «полный/неполный» короб
        krat_map: dict[str, int] = {}
        for _, er in enriched.iterrows():
            sku = str(er["SKU_Ozon"]).strip()
            shk = f"OZN{sku}" if sku and sku != "nan" else str(er["ШК"])
            krat_map[shk] = int(er["Кратность"])

        df_boxes = pd.DataFrame([{
            "№ короба":      b["box_num"],
            "Кластер":       b["cluster"],
            "Название":      b["Название"],
            "ШК":            b["shk_tovar"],
            "Артикул":       b["articul"],
            "Штук в коробе": b["qty"],
            "ШК ГМ":         b["shk_gm"],
            "Полный":        "Да" if b["qty"] >= krat_map.get(b["shk_tovar"], b["qty"]) else "Нет",
        } for b in all_boxes], columns=[
            "№ короба", "Кластер", "Название", "ШК", "Артикул", "Штук в коробе", "ШК ГМ", "Полный"
        ])
        df_boxes.to_excel(w, sheet_name="Разбивка коробов", index=False)
        ws3 = w.sheets["Разбивка коробов"]
        for col, width in zip("ABCDEFGH", [10, 28, 38, 14, 18, 14, 22, 8]):
            ws3.column_dimensions[col].width = width

    buf.seek(0)
    data = buf.read()
    if out_dir:
        fname = f"Заявка_цех_{prod_date.strftime('%Y%m%d')}.xlsx"
        (out_dir / fname).write_bytes(data)
        log.info("Saved factory order: %s", fname)
    return data


# ─────────────────────────────────────────────────────────────────────────────
# 5. ZIP-архив
# ─────────────────────────────────────────────────────────────────────────────

def build_archive(factory_bytes: bytes, cargo_by_cluster: dict[str, bytes],
                  label_by_cluster: dict[str, bytes], prod_date: date,
                  out_dir: Path | None) -> bytes:
    buf = io.BytesIO()
    date_tag = prod_date.strftime("%Y%m%d")
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"Заявка_цех_{date_tag}.xlsx", factory_bytes)
        for cluster, data in cargo_by_cluster.items():
            safe = cluster.replace(" ", "_").replace("/", "-")
            zf.writestr(f"Состав_ГМ/{safe}.xlsx", data)
        for cluster, pdf in label_by_cluster.items():
            safe = cluster.replace(" ", "_").replace("/", "-")
            zf.writestr(f"Этикетки_ГМ/{safe}.pdf", pdf)
    buf.seek(0)
    archive = buf.read()
    if out_dir:
        fpath = out_dir / f"Поставка_Ozon_{date_tag}.zip"
        fpath.write_bytes(archive)
        log.info("Archive: %s (%.1f KB)", fpath.name, len(archive) / 1024)
    return archive


# ─────────────────────────────────────────────────────────────────────────────
# ГЛАВНАЯ ФУНКЦИЯ — полный цикл
# ─────────────────────────────────────────────────────────────────────────────

def run_full_supply(run_id: str, use_api: bool = True,
                    shelf_months: int = 8,
                    ship_date_str: str | None = None) -> None:
    """Полный цикл: остатки цеха → Ozon → поставка → документы.

    use_api=True:      создаёт поставки в Ozon + получает ШК ГМ
    use_api=False:     только xlsx (для ручного создания поставки в ЛК)
    shelf_months:      срок годности в месяцах от даты производства (default 8)
    ship_date_str:     дата отгрузки YYYY-MM-DD (default: prod_date + 14 дней)
    """
    from datetime import timedelta
    from pathlib import Path as _Path

    from src.config import CFG, get_ozon_credentials
    from src.db import get_connection, init_db
    from src.logic.allocation import allocate
    from src.logic.demand import compute_demand
    from src.logic.velocity import compute_velocity
    from src.ozon_api import OzonClient
    from src.sources.catalog import get_gspread_client, load_catalog
    from src.sources.orders_api import fetch_orders_by_sku
    from src.sources.orders_csv import load_orders, save_orders_to_db
    from src.sources.stocks_factory import load_factory_stocks, save_factory_stocks_to_db
    from src.sources.stocks_ozon import fetch_stocks, save_stocks_to_db
    from src.sinks.gsheet_plan import write_log, write_plan, write_plan_view

    prod_date = date.today()
    if ship_date_str:
        ship_date = date.fromisoformat(ship_date_str)
    else:
        ship_date = prod_date + timedelta(days=14)

    log.info("=== Full supply run started (run_id=%s, prod_date=%s) ===",
             run_id, prod_date)

    # ── 0. Инициализация ──────────────────────────────────────────────────────
    init_db()
    gc = get_gspread_client()
    catalog = load_catalog(gc)
    client_id, api_key = get_ozon_credentials("sergashov")
    client = OzonClient(client_id, api_key)

    active_catalog = (
        catalog[catalog["status"] == "active"]
        if "status" in catalog.columns else catalog
    )
    catalog_skus = (
        active_catalog["SKU_Ozon"].dropna().astype(str)
        .str.strip().pipe(lambda s: s[s != ""])
        .tolist()
    )
    log.info("Active catalog SKUs: %d", len(catalog_skus))

    with get_connection() as conn:
        # ── 1. Остатки Ozon ───────────────────────────────────────────────────
        stocks = fetch_stocks(client, skus=catalog_skus)
        save_stocks_to_db(stocks, run_id, conn)

        # ── 2. Заказы: API → fallback CSV ─────────────────────────────────────
        known_skus = (set(catalog["SKU_Ozon"].astype(str))
                      | set(catalog["ШК"].astype(str)))
        orders_dir = _Path("data/orders")
        csv_files  = sorted(orders_dir.glob("*.csv"))
        try:
            orders = fetch_orders_by_sku(client)
            log.info("Orders from API: %d rows", len(orders))
        except Exception as e:
            log.warning("API orders failed (%s), using CSV", e)
            orders = pd.DataFrame()

        if csv_files:
            try:
                csv_orders = load_orders(csv_files[-1], known_skus=known_skus)
                if len(orders) == 0 or len(set(csv_orders["sku"].astype(str).unique()) & known_skus) > 0:
                    orders = csv_orders
                    log.info("Using CSV orders: %d rows", len(orders))
            except Exception as e:
                log.warning("CSV load failed: %s", e)

        if len(orders) == 0:
            raise FileNotFoundError("No orders from API or CSV")

        save_orders_to_db(orders, run_id, conn)

    # ── 3. Velocity + Demand ──────────────────────────────────────────────────
    velocity = compute_velocity(orders)
    wh_map: dict = CFG.get("warehouse_clusters", {})
    demand   = compute_demand(velocity, stocks, active_catalog, wh_map)

    # ── 4. Остатки цеха → аллокация ───────────────────────────────────────────
    factory_dir  = _Path("data/stocks_factory")
    xlsx_files   = sorted(
        list(factory_dir.glob("*.xlsx")) + list(factory_dir.glob("*.xls")),
        key=lambda p: p.stat().st_mtime,
    )
    factory_stocks: dict[str, float] = {}

    if xlsx_files:
        bom = CFG.get("bom", {})
        fact_df = load_factory_stocks(xlsx_files[-1], bom=bom if bom else None)
        with get_connection() as conn:
            save_factory_stocks_to_db(fact_df, run_id, conn)

        import re as _re

        def _norm(s):
            return _re.sub(r'[^\w\s]', ' ', _re.sub(r'[_/]', ' ', s)).lower()

        def _sig(s, n=3):
            return [w for w in _norm(s).split() if len(w) >= n]

        name_to_bk: dict[str, str] = {}
        ozon_name_to_bk: dict[str, str] = {}
        for _, cr in catalog.iterrows():
            bk  = str(cr["ШК"])
            цех = str(cr.get("Название_цех", "")).strip()
            ozn = str(cr.get("Название_Ozon", "")).strip()
            for alias in цех.split(";"):
                a = alias.strip()
                if a and a not in ("", "nan"):
                    name_to_bk[a.lower()] = bk
            if ozn and ozn not in ("", "nan"):
                ozon_name_to_bk[ozn.lower()] = bk

        pcs_df = fact_df[fact_df["unit"] == "pcs"] if "unit" in fact_df.columns else fact_df
        for _, row in pcs_df.iterrows():
            fname = str(row["name_factory"])
            fn    = _norm(fname).strip()
            bk    = name_to_bk.get(fn)
            if not bk:
                fw = _sig(fname)
                best, bs = None, 0
                for cn, cbk in name_to_bk.items():
                    cw = _sig(cn)
                    if cw and sum(1 for w in cw if w in fn) == len(cw) and len(cw) > bs:
                        bs, best = len(cw), cbk
                bk = best
            if not bk:
                fw = _sig(fname)
                min_h = 2 if len(fw) <= 3 else 3
                min_r = 0.5 if len(fw) <= 3 else 0.55
                best2, bo = None, 0
                for on, obk in ozon_name_to_bk.items():
                    hits = sum(1 for w in fw if w in _norm(on))
                    if hits >= min_h and (not fw or hits / len(fw) >= min_r) and hits > bo:
                        bo, best2 = hits, obk
                bk = best2
            if bk:
                factory_stocks[bk] = factory_stocks.get(bk, 0) + float(row["quantity"])
        log.info("Factory stocks matched: %d unique barcodes", len(factory_stocks))
    else:
        log.warning("No factory stock files — allocation unlimited")

    allocated = allocate(demand, factory_stocks)

    # days_after для плана
    total_alloc = (
        allocated.groupby("ШК")["allocated_qty"].sum().to_dict()
        if "ШК" in allocated.columns else {}
    )
    allocated["factory_remaining"] = allocated["ШК"].map(
        lambda bk: factory_stocks.get(str(bk), 0) - total_alloc.get(bk, 0) if bk else 0
    )
    allocated["days_after"] = allocated.apply(
        lambda r: (r.get("effective_stock", 0) + r["allocated_qty"]) / r["avg_daily_sales"]
        if r["avg_daily_sales"] > 0 else float("inf"),
        axis=1,
    ).clip(upper=999)

    # ── 5. Запись в Google Sheet (для истории и мониторинга) ──────────────────
    write_plan(allocated, ship_date, run_id, gc)
    write_plan_view(allocated, ship_date, run_id, gc)

    # ── 6. Строим список утверждённых позиций из allocated ───────────────────
    # В полном авто-режиме берём всё с allocated_qty > 0 без ручного утверждения
    approved_rows = []
    for _, r in allocated[allocated["allocated_qty"] > 0].iterrows():
        approved_rows.append({
            "cluster":   r.get("cluster", ""),
            "ШК":        r.get("ШК", ""),
            "qty":       int(r["allocated_qty"]),
            "Название":  r.get("Название_Ozon", ""),
        })
    if not approved_rows:
        log.warning("Nothing to supply — all allocated_qty = 0")
        write_log(run_id, "WARN", "no supply needed", gc)
        return

    approved = pd.DataFrame(approved_rows)
    enriched = enrich_plan(approved, catalog)

    log.info("Supply plan: %d clusters, %d SKUs, %d pcs total",
             enriched["cluster"].nunique(),
             enriched["ШК"].nunique(),
             int(enriched["qty"].sum()))

    # ── 7. Создаём поставки в Ozon + получаем ШК ГМ ──────────────────────────
    out_dir = OUTPUT_DIR / f"supply_{run_id}"
    out_dir.mkdir(parents=True, exist_ok=True)

    all_boxes:     list[dict]        = []
    cargo_xlsx:    dict[str, bytes]  = {}
    label_pdfs:    dict[str, bytes]  = {}
    supply_ids:    dict[str, str]    = {}

    # Маппинг кластер → склад из Google Sheet «Маппинг_складов»
    from src.sources.catalog import load_warehouse_map
    cluster_wh_map = load_warehouse_map(gc)

    wh_by_name: dict[str, int] = {}
    if use_api:
        try:
            wh_by_name = get_warehouse_map(client)
        except Exception as e:
            log.error("get_warehouses failed: %s", e)

    for cluster, grp in enriched.groupby("cluster"):
        result = create_supply_for_cluster(
            client         = client if use_api else _NullClient(),
            cluster        = cluster,
            rows           = grp,
            wh_by_name     = wh_by_name,
            ship_date      = ship_date,
            prod_date      = prod_date,
            shelf_months   = shelf_months,
            cluster_wh_map = cluster_wh_map,
        )
        boxes = result["boxes"]
        all_boxes.extend(boxes)
        supply_ids[cluster] = result["supply_order_id"]

        # xlsx Состав ГМ
        cargo_xlsx[cluster] = generate_cargo_xlsx(boxes, cluster, out_dir)

        # PDF этикеток
        if use_api and result["supply_order_id"]:
            try:
                pdf = client.get_cargo_labels(result["supply_order_id"])
                label_pdfs[cluster] = pdf
                safe = cluster.replace(" ", "_").replace("/", "-")
                (out_dir / f"Этикетки_{safe}.pdf").write_bytes(pdf)
                log.info("Labels downloaded: cluster='%s'", cluster)
            except Exception as e:
                log.warning("Labels failed for '%s': %s", cluster, e)

    # ── 8. Сводная для цеха ───────────────────────────────────────────────────
    factory_order = generate_factory_order(all_boxes, enriched, prod_date, out_dir)

    # ── 9. ZIP-архив ──────────────────────────────────────────────────────────
    build_archive(factory_order, cargo_xlsx, label_pdfs, prod_date, out_dir)

    # ── 10. Telegram-сводка ───────────────────────────────────────────────────
    from src.sinks.telegram_bot import send_weekly_summary
    send_weekly_summary(
        ship_date = ship_date,
        clusters  = enriched["cluster"].nunique(),
        boxes     = int(enriched["total_boxes"].sum()),
        skus      = enriched["ШК"].nunique(),
        critical  = int(allocated["is_critical"].sum()),
    )

    write_log(run_id, "OK",
              f"supply_create ship_date={ship_date} clusters={enriched['cluster'].nunique()} "
              f"boxes={enriched['total_boxes'].sum()} api={use_api}",
              gc)
    log.info("=== Full supply run complete → %s ===", out_dir)


# ─────────────────────────────────────────────────────────────────────────────
# Вспомогательный «null» клиент для режима без API
# ─────────────────────────────────────────────────────────────────────────────

class _NullClient:
    """Заглушка клиента — методы не вызываются в режиме без API."""
    def create_supply_draft(self, body): return {}
    def create_cargoes(self, body):      return {}
    def get_cargo_labels(self, cid):     return b""
    def get_warehouses(self):            return []


def get_warehouse_map(client) -> dict[str, int]:
    wh_list = client.get_warehouses()
    result = {}
    for wh in wh_list:
        name = wh.get("name", "")
        wh_id = wh.get("warehouse_id") or wh.get("id")
        if name and wh_id:
            result[name] = int(wh_id)
    log.info("Warehouses: %d", len(result))
    return result
