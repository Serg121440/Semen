"""Создание supply orders в Ozon LK через API.

Цепочка endpoints:
  1. POST /v1/draft/multi-cluster/create  → draft_id  (rate 2/min!)
  2. POST /v2/draft/create/info           → bundle_id, availability
  3. POST /v2/draft/timeslot/info         → доступные таймслоты
  4. POST /v2/draft/supply/create         → operation_id
  5. POST /v2/draft/supply/create/status  → supply_order_ids (часто TIMEOUT —
     supply_id можно найти позже в /v3/supply-order/list)

Лимиты:
  - 2 draft/мин и 50/час
  - 30 коробов или 40 паллет в одной cargoes/create
"""
from __future__ import annotations
import logging, time, requests
from dataclasses import dataclass
from datetime import date, datetime

log = logging.getLogger(__name__)
API = "https://api-seller.ozon.ru"
TULA_HUB_ID = 1020005005498750  # ТУЛА_ХАБ_ЩЕГЛОВСКАЯ_ЗАСЕКА — crossdock для ИП Сергашов/Лебедев


@dataclass
class SupplyResult:
    macro: int
    state: str           # 'created' | 'draft_err' | 'no_slot' | 'create_err'
    draft_id: int | None = None
    bundle_id: str | None = None
    operation_id: str | None = None
    supply_id: int | None = None
    timeslot: dict | None = None
    error: str | None = None


def _post(headers: dict, path: str, body: dict, timeout: int = 30,
          retries: int = 3) -> requests.Response | None:
    for i in range(retries):
        try:
            return requests.post(API + path, json=body, headers=headers, timeout=timeout)
        except requests.RequestException as e:
            log.warning(f"  retry {i+1}: {e.__class__.__name__}")
            time.sleep(5)
    return None


def create_draft_multi_cluster(headers: dict, macro: int, items: list[dict],
                                drop_off_warehouse_id: int = TULA_HUB_ID) -> int | None:
    """Шаг 1: создать draft для одного кластера.
    items: [{"sku": int, "quantity": int}]
    """
    body = {
        "clusters_info": [{"macrolocal_cluster_id": macro, "items": items}],
        "type": "CREATE_TYPE_CROSSDOCK",
        "deletion_sku_mode": "PARTIAL",
        "delivery_info": {"type": 1, "drop_off_warehouse": {
            "warehouse_id": drop_off_warehouse_id, "warehouse_type": 1}},
    }
    for attempt in range(5):
        time.sleep(5 if attempt == 0 else 35)
        r = _post(headers, "/v1/draft/multi-cluster/create", body)
        if not r: continue
        if r.status_code == 429:
            log.warning(f"  draft macro={macro}: 429 rate limit, retry"); continue
        if r.status_code != 200:
            log.error(f"  draft macro={macro}: {r.status_code} {r.text[:200]}")
            return None
        return r.json().get('draft_id')
    return None


def get_draft_info(headers: dict, draft_id: int) -> dict | None:
    """Шаг 2: получить bundle_id."""
    time.sleep(2)
    r = _post(headers, "/v2/draft/create/info", {"draft_id": draft_id})
    if not r or r.status_code != 200: return None
    return r.json()


def get_timeslots(headers: dict, draft_id: int, macro: int, bundle_id: str,
                  ship_date: date) -> list[dict]:
    """Шаг 3: получить доступные слоты на ship_date."""
    body = {
        "draft_id": draft_id,
        "date_from": ship_date.strftime("%Y-%m-%d"),
        "date_to": ship_date.strftime("%Y-%m-%d"),
        "selected_cluster_warehouses": [
            {"macrolocal_cluster_id": macro, "bundle_id": bundle_id}],
        "supply_type": "MULTI_CLUSTER",
    }
    time.sleep(2)
    r = _post(headers, "/v2/draft/timeslot/info", body)
    if not r or r.status_code != 200: return []
    days = (((r.json() or {}).get('result') or {})
            .get('drop_off_warehouse_timeslots') or {}).get('days') or []
    slots = []
    for d in days:
        for s in d.get('timeslots') or []:
            slots.append(s)
    return slots


def create_supply(headers: dict, draft_id: int, macro: int, bundle_id: str,
                   timeslot: dict) -> str | None:
    """Шаг 4: подтвердить supply. Возвращает operation_id."""
    body = {
        "draft_id": draft_id, "supply_type": "MULTI_CLUSTER",
        "timeslot": {
            "from_in_timezone": timeslot['from_in_timezone'],
            "to_in_timezone": timeslot['to_in_timezone']},
        "selected_cluster_warehouses": [
            {"macrolocal_cluster_id": macro, "bundle_id": bundle_id}],
    }
    time.sleep(2)
    r = _post(headers, "/v2/draft/supply/create", body)
    if not r or r.status_code != 200:
        log.error(f"  supply/create macro={macro}: {r.text[:200] if r else 'no resp'}")
        return None
    return r.json().get('operation_id')


def find_supply_id(headers: dict, macro: int, ship_date: date,
                    known_ids: set[int]) -> int | None:
    """Найти свежесозданный supply_id в /v3/supply-order/list."""
    time.sleep(5)
    r = _post(headers, "/v3/supply-order/list",
              {"page": 1, "limit": 100, "sort_by": 1, "sort_direction": 1,
               "filter": {"states": [1, 2]}})
    if not r or r.status_code != 200: return None
    ids = r.json().get('order_ids', [])
    r2 = _post(headers, "/v3/supply-order/get", {"order_ids": ids[:50]})
    if not r2 or r2.status_code != 200: return None
    ship_str = ship_date.strftime("%Y-%m-%d")
    for o in r2.json().get('orders', []):
        if ship_str not in str(o): continue
        sup = (o.get('supplies') or [{}])[0]
        sid = sup.get('supply_id')
        if sid in known_ids: continue
        if int(sup.get('macrolocal_cluster_id') or 0) == macro:
            return sid
    return None


def create_supply_for_cluster(headers: dict, macro: int, items: list[dict],
                               ship_date: date, known_ids: set[int]) -> SupplyResult:
    """Полная цепочка: draft → info → timeslot → create → найти supply_id."""
    res = SupplyResult(macro=macro, state='draft_err')

    draft_id = create_draft_multi_cluster(headers, macro, items)
    if not draft_id:
        return res
    res.draft_id = draft_id

    info = get_draft_info(headers, draft_id)
    if not info or info.get('status') != 'SUCCESS':
        res.error = f"draft info status={info.get('status') if info else 'no_resp'}"
        return res
    bundle_id = info['clusters'][0]['warehouses'][0]['bundle_id']
    res.bundle_id = bundle_id

    slots = get_timeslots(headers, draft_id, macro, bundle_id, ship_date)
    if not slots:
        res.state = 'no_slot'
        res.error = f"нет слотов на {ship_date}"
        return res
    res.timeslot = slots[0]

    op = create_supply(headers, draft_id, macro, bundle_id, slots[0])
    if not op:
        res.state = 'create_err'
        return res
    res.operation_id = op

    # Опционально — найти supply_id
    sid = find_supply_id(headers, macro, ship_date, known_ids)
    if sid:
        res.supply_id = sid
        known_ids.add(sid)

    res.state = 'created'
    return res
