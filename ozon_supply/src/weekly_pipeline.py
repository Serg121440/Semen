"""
Еженедельный pipeline FBO-поставки Ozon (понедельник 09:00 МСК).

11 шагов согласно best practice 2026-06-15:
  1. demand (Ozon analytics + stocks)
  2. factory stocks (1С XLS — из email/Drive)
  3. plan (matching + BOM + распределение по кластерам)
  4. write_summary (Google Sheets — сводная + Отгрузки Цех)
  5. wait_factory_confirm (опционально — пауза для подтверждения цехом)
  6. sostav_gm (Google Apps Script через trigger или ручной запуск)
  7. create_supplies (Ozon API — drafts per cluster)
  8. fill_cargoes (Ozon API — boxes)
  9. reconcile (LK ↔ план, обновление таблиц по факту)
 10. labels (PDF этикетки + upload в Shared Drive)
 11. archive_zip (XLS+PDF по складам)
"""
from __future__ import annotations
import logging, json, os, sys, time
from datetime import date, datetime, timedelta
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger(__name__)


@dataclass
class RunContext:
    run_id: str
    ship_date: date                    # дата отгрузки (пятница)
    factory_xls: Path                  # путь к остаткам цеха
    ip_accounts: list[str] = field(default_factory=lambda: ["sergashov", "lebedev"])
    out_dir: Path = Path("data") / "runs"
    drive_folder_id: Optional[str] = None   # ID Shared Drive
    results: dict = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: demand
# ─────────────────────────────────────────────────────────────────────────────
def step1_demand(ctx: RunContext) -> dict:
    """Скачать demand-отчёт из Ozon API для каждого ИП.

    Returns: {ip: pd.DataFrame с колонками SKU, Артикул, Кластер, Рек_шт}
    """
    from src.config import get_ozon_credentials
    from src.ozon_api import OzonClient
    from src.sources.catalog import load_catalog, get_gspread_client
    import pandas as pd

    log.info("[1/11] Demand: загружаем из Ozon API")
    gc = get_gspread_client()
    catalog = load_catalog(gc)

    demand = {}
    for ip in ctx.ip_accounts:
        client_id, api_key = get_ozon_credentials(ip)
        client = OzonClient(client_id, api_key)
        ip_skus = catalog[catalog['ИП'].str.contains(ip, case=False, na=False)]['SKU_Ozon'].dropna().astype(int).tolist()
        stocks = client.get_analytics_stocks(skus=ip_skus)
        rows = []
        for item in stocks.get('items', []):
            rows.append({
                'SKU': item['sku'], 'Артикул': item.get('offer_id', ''),
                'Название': item.get('name', ''), 'Кластер': item.get('cluster_name', ''),
                'Рек_шт': item.get('requested_stock_count', 0) or 0,
                'Среднесуточные': item.get('ads', 0),
            })
        demand[ip] = pd.DataFrame(rows)
        log.info(f"  {ip}: {len(rows)} строк demand")

    ctx.results['demand'] = demand
    return demand


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: factory_stocks (already exists — load_factory_stocks)
# ─────────────────────────────────────────────────────────────────────────────
def step2_factory_stocks(ctx: RunContext) -> dict:
    from src.sources.stocks_factory import parse_report_xls
    log.info(f"[2/11] Factory stocks: {ctx.factory_xls}")
    stocks = {}
    for ip in ctx.ip_accounts:
        ip_filter = "Сергашов" if ip == "sergashov" else "Лебедев"
        stocks[ip] = parse_report_xls(str(ctx.factory_xls), ip_filter=ip_filter)
        total_pcs = sum(info['qty'] for wh, items in stocks[ip].items()
                        for _, info in items.items() if info['unit'] == 'шт')
        log.info(f"  {ip}: {total_pcs:.0f} шт готовой в цеху")
    ctx.results['factory_stocks'] = stocks
    return stocks


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: plan (matching + BOM + распределение)
# ─────────────────────────────────────────────────────────────────────────────
def step3_plan(ctx: RunContext) -> dict:
    """Построить план по (ИП, кластер, SKU) с учётом остатков и кратности."""
    from src.sources.catalog import load_catalog, get_gspread_client
    from src.config import CFG
    import pandas as pd

    log.info("[3/11] Plan: матчим SKU + BOM + распределяем по кластерам")
    gc = get_gspread_client()
    catalog = load_catalog(gc)
    catalog['SKU_Ozon'] = pd.to_numeric(catalog['SKU_Ozon'], errors='coerce')
    krat = dict(zip(catalog['SKU_Ozon'].astype(float), catalog['Кратность']))

    plans = {}
    for ip in ctx.ip_accounts:
        demand = ctx.results['demand'][ip]
        # Тут логика распределения — берём reк_шт по кластеру, ограничиваем остатком цеха
        # (упрощённо — детальная реализация в STEP 9)
        plans[ip] = demand[demand['Рек_шт'] > 0].copy()
        plans[ip]['Отгрузка'] = plans[ip]['Рек_шт']
        plans[ip]['Кратность'] = plans[ip]['SKU'].astype(float).map(krat).fillna(10).astype(int)

    ctx.results['plans'] = plans
    return plans


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: write_summary (Google Sheets)
# ─────────────────────────────────────────────────────────────────────────────
def step4_write_summary(ctx: RunContext):
    """Записать сводную для цеха + Отгрузки Цех в Google Sheets."""
    from src.sources.catalog import get_gspread_client, load_catalog
    from src.sinks.sheets_writer import (write_svodnaya, write_otgruzki_tseh,
                                          DEFAULT_ARTIKUL_MAP)
    import pandas as pd

    log.info("[4/11] Запись в Google Sheets (сводная + Отгрузки Цех)")
    gc = get_gspread_client()
    catalog = load_catalog(gc)
    catalog['SKU_Ozon'] = pd.to_numeric(catalog['SKU_Ozon'], errors='coerce')
    sku_to_oznm = dict(zip(catalog['SKU_Ozon'].dropna().astype(int), catalog['Название_Ozon']))
    sku_to_shk = dict(zip(catalog['SKU_Ozon'].dropna().astype(int), catalog['ШК']))
    sku_to_factnm = dict(zip(catalog['SKU_Ozon'].dropna().astype(int), catalog['Название_цех']))

    ship_date_str = ctx.ship_date.strftime("%d.%m.%Y")
    cluster_to_wh = ctx.results.get('cluster_to_wh', {})

    urls = {}
    for ip in ctx.ip_accounts:
        plan = ctx.results['plans'][ip]
        if plan.empty: continue
        ip_name = "Сергашов" if ip == "sergashov" else "Лебедев"

        # Агрегируем по SKU для сводной
        by_sku = {}
        otgruzki_entries = []
        for _, r in plan.iterrows():
            sku = int(r['SKU']); qty = int(r['Отгрузка'])
            wh = cluster_to_wh.get(r['Кластер'], r['Кластер'])
            by_sku.setdefault(sku, {'qty': 0, 'whs': set(),
                'name': sku_to_oznm.get(sku, r.get('Название', '?')),
                'shk': sku_to_shk.get(sku, f'OZN{sku}')})
            by_sku[sku]['qty'] += qty
            by_sku[sku]['whs'].add(wh)
            otgruzki_entries.append({
                'ip': ip_name, 'qty': qty,
                'artikul_catalog': sku_to_factnm.get(sku, f'SKU_{sku}'),
                'warehouse': wh,
            })

        urls[f'svodnaya_{ip}'] = write_svodnaya(gc, ship_date_str, ip_name, by_sku)
        urls[f'otgruzki_{ip}'] = write_otgruzki_tseh(
            gc, ctx.ship_date.strftime("%d.%m.%Y"),
            otgruzki_entries, DEFAULT_ARTIKUL_MAP,
        )

    ctx.results['sheets_urls'] = urls
    log.info(f"  Google Sheets обновлены: {urls}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: wait_factory_confirm
# ─────────────────────────────────────────────────────────────────────────────
def step5_wait_factory(ctx: RunContext, timeout_hours: int = 24):
    """Отправить Telegram-уведомление цеху со ссылками на сводные."""
    from src.sinks.telegram_bot import send_message

    log.info("[5/11] Уведомление цеху в Telegram")
    plans = ctx.results.get('plans', {})
    urls = ctx.results.get('sheets_urls', {})

    lines = [f"📦 *План на отгрузку {ctx.ship_date.strftime('%d.%m.%Y')}*", ""]
    total_q = 0; total_cl = 0
    for ip, plan in plans.items():
        if plan.empty: continue
        ip_name = "Сергашов" if ip == "sergashov" else "Лебедев"
        q = int(plan['Отгрузка'].sum())
        cl = plan['Кластер'].nunique()
        total_q += q; total_cl += cl
        lines.append(f"• ИП {ip_name}: {q} шт, {cl} кластеров, {plan['SKU'].nunique()} SKU")
    lines.append(f"\n*Итого: {total_q} шт, {total_cl} уникальных кластеров*")

    if urls:
        lines.append("\n📊 Ссылки:")
        for k, u in urls.items():
            lines.append(f"  • [{k}]({u})")

    lines.append(f"\n⏳ Цех — подтвердите остатки до {ctx.ship_date.strftime('%d.%m')} 12:00")
    send_message("\n".join(lines))
    log.info("  Telegram уведомление отправлено")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: sostav_gm (Apps Script)
# ─────────────────────────────────────────────────────────────────────────────
def step6_sostav_gm(ctx: RunContext):
    """Запуск Apps Script 'создатьШаблонСоставаГМ_на_вкладке' через Drive API."""
    log.info("[6/11] Запуск скрипта формирования Состав ГМ")
    # TODO: через Apps Script Execution API
    raise NotImplementedError("STEP 6: интегрировать вызов Apps Script")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: create_supplies
# ─────────────────────────────────────────────────────────────────────────────
def step7_create_supplies(ctx: RunContext):
    """Создать supply orders в LK для каждой пары (ИП, кластер).

    Только для кластеров, которых ещё нет в LK на ship_date.
    """
    from src.config import get_ozon_credentials
    from src.auto.supply_api import create_supply_for_cluster, _post

    log.info("[7/11] Создание supplies в LK Ozon")

    # Маппинг кластер_name → macrolocal_id
    import json
    cluster_data = json.load(open('data/demand_15june/ozon_clusters.json'))
    name_to_macro = {c['name']: c['macrolocal_cluster_id'] for c in cluster_data['clusters']}

    all_supplies = {}  # {ip: {macro: SupplyResult}}
    for ip in ctx.ip_accounts:
        client_id, api_key = get_ozon_credentials(ip)
        H = {"Client-Id": client_id, "Api-Key": api_key,
             "Content-Type": "application/json"}

        # Получим уже существующие supply на ship_date
        r = _post(H, "/v3/supply-order/list",
                  {"page":1,"limit":100,"sort_by":1,"sort_direction":1,"filter":{"states":[1,2,3,4,5]}})
        ids = (r.json().get('order_ids', []) if r and r.status_code==200 else [])
        r2 = _post(H, "/v3/supply-order/get", {"order_ids": ids[:50]})
        already = {}  # macro → supply_id
        known_ids = set()
        if r2 and r2.status_code == 200:
            ship_str = ctx.ship_date.strftime("%Y-%m-%d")
            for o in r2.json().get('orders', []):
                if ship_str not in str(o): continue
                sup = (o.get('supplies') or [{}])[0]
                sid = sup.get('supply_id'); known_ids.add(sid)
                already[int(sup.get('macrolocal_cluster_id') or 0)] = sid

        plan = ctx.results['plans'][ip]
        if plan.empty: continue

        # План → items по кластерам
        results = {}
        for cl, grp in plan.groupby('Кластер'):
            macro = name_to_macro.get(cl)
            if not macro:
                log.warning(f"  ⚠️ {ip}: кластер {cl!r} нет в маппинге, пропускаем"); continue
            if macro in already:
                log.info(f"  ⏭ {ip} {cl}: уже supply={already[macro]}")
                from src.auto.supply_api import SupplyResult
                results[macro] = SupplyResult(macro=macro, state='exists', supply_id=already[macro])
                continue
            items = [{"sku": int(r['SKU']), "quantity": int(r['Отгрузка'])}
                     for _, r in grp.iterrows() if r['Отгрузка'] > 0]
            if not items: continue
            log.info(f"  {ip} {cl} (macro={macro}): {len(items)} SKU, {sum(x['quantity'] for x in items)} шт")
            res = create_supply_for_cluster(H, macro, items, ctx.ship_date, known_ids)
            icon = '✅' if res.state == 'created' else '❌'
            log.info(f"  {icon} {cl}: state={res.state} supply_id={res.supply_id}")
            results[macro] = res

        all_supplies[ip] = results

    ctx.results['supplies'] = all_supplies
    n_created = sum(1 for ip in all_supplies.values() for r in ip.values() if r.state == 'created')
    n_exists = sum(1 for ip in all_supplies.values() for r in ip.values() if r.state == 'exists')
    log.info(f"  Итог: создано {n_created}, уже существовало {n_exists}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 8: fill_cargoes
# ─────────────────────────────────────────────────────────────────────────────
def step8_fill_cargoes(ctx: RunContext):
    """Наполнить supplies коробами через /v1/cargoes/create (batch по 30).

    Формат body: {
      "supply_id": ..., "delete_current_version": true,
      "cargoes": [{"key":"box-N", "value":{
         "type":"BOX",
         "items":[{"barcode":"OZN...","offer_id":"...","quantity":N,"quant":1,"expires_at":"YYYY-MM-DDT23:59:59Z"}]
      }}]
    }
    Для SKU не-в-bundle → отдельная supply того же кластера.
    """
    log.info("[8/11] Наполнение cargoes (по 30 в batch)")
    raise NotImplementedError("STEP 8: интегрировать cargoes_create")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 9: reconcile (сверка LK ↔ план)
# ─────────────────────────────────────────────────────────────────────────────
def step9_reconcile(ctx: RunContext):
    """Получить реальные cargoes из LK, обновить таблицы по факту.

    Обновления:
      - Состав ГМ | <дата>: реальные cargo_id в столбец E
      - Сводная для цеха: по факту LK (не по плану)
      - Отгрузки Цех: переписать по факту
    """
    log.info("[9/11] Сверка с LK + обновление таблиц по факту")
    raise NotImplementedError("STEP 9: интегрировать fact_reconcile")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 10: labels
# ─────────────────────────────────────────────────────────────────────────────
def step10_labels(ctx: RunContext):
    """Скачать PDF этикетки для каждой supply и залить в Shared Drive."""
    log.info("[10/11] Генерация PDF этикеток + upload в Drive")
    # /v1/cargoes-label/create → /get (operation_id) → file_url → download
    # upload в ctx.drive_folder_id
    raise NotImplementedError("STEP 10: интегрировать labels_download")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 11: archive_zip
# ─────────────────────────────────────────────────────────────────────────────
def step11_archive(ctx: RunContext):
    """Сформировать ZIP-архив по складам для цеха."""
    log.info("[11/11] ZIP-архив по складам")
    raise NotImplementedError("STEP 11: интегрировать build_zip_by_warehouse")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
def run_pipeline(ship_date: date, factory_xls: Path,
                  drive_folder_id: str | None = None,
                  steps: list[int] | None = None):
    """Запуск pipeline. steps=None → все 11. steps=[1,2,3] → только указанные."""
    from src.sinks.telegram_bot import send_text

    ctx = RunContext(
        run_id=f"weekly_{ship_date.strftime('%Y%m%d')}",
        ship_date=ship_date,
        factory_xls=factory_xls,
        drive_folder_id=drive_folder_id,
    )
    ctx.out_dir.mkdir(parents=True, exist_ok=True)

    STEPS = [
        (1, step1_demand), (2, step2_factory_stocks), (3, step3_plan),
        (4, step4_write_summary), (5, step5_wait_factory), (6, step6_sostav_gm),
        (7, step7_create_supplies), (8, step8_fill_cargoes), (9, step9_reconcile),
        (10, step10_labels), (11, step11_archive),
    ]
    to_run = STEPS if steps is None else [(n, f) for n, f in STEPS if n in steps]

    log.info(f"=== Weekly pipeline run_id={ctx.run_id} ship={ship_date} ===")
    for n, fn in to_run:
        try:
            fn(ctx)
        except NotImplementedError as e:
            log.warning(f"  ⏭ STEP {n} не реализован: {e}")
        except Exception as e:
            log.exception(f"  ❌ STEP {n} упал: {e}")
            try:
                send_text(f"⚠️ Pipeline ship={ship_date}: STEP {n} упал: {e}")
            except Exception:
                pass
            raise

    log.info(f"=== DONE run_id={ctx.run_id} ===")
    # Сохраним результат
    with open(ctx.out_dir / f"{ctx.run_id}.json", 'w') as f:
        json.dump({k: str(v) for k, v in ctx.results.items()}, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--ship-date", required=True, help="YYYY-MM-DD")
    p.add_argument("--factory-xls", required=True)
    p.add_argument("--drive-folder", default=None)
    p.add_argument("--steps", nargs="+", type=int, help="Только указанные шаги (по умолчанию все)")
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    run_pipeline(
        ship_date=date.fromisoformat(args.ship_date),
        factory_xls=Path(args.factory_xls),
        drive_folder_id=args.drive_folder,
        steps=args.steps,
    )
