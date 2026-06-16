"""Запись плана поставки в Google Sheets:
  1. «Сводная за <дата> - ИП <ИП> - OZON» (один лист на ИП)
     URL: 108ZQY8vdHK5Dil0UMKoss5MUR874R4NYA-rwKpHRxTg
     Колонки: №, Название товара, Штрихкоды, Кол-во (шт), Вес 1 шт, Общий вес, Склады

  2. «Отгрузки Цех» (одна строка = SKU × склад)
     URL: 1nLyxuX1W_GSn-GkuiLgea-_QErB8cqkSYqv1UrZwBF8
     Колонки A-M (см. ниже). E,F,G,M = формулы VLOOKUP

Артикулы в колонке I = из листа Goods (текстовый offer_id для VLOOKUP).
"""
from __future__ import annotations
import re, logging, time
from typing import Optional
import pandas as pd
import gspread

log = logging.getLogger(__name__)

SVODNAYA_SHEET_ID = "108ZQY8vdHK5Dil0UMKoss5MUR874R4NYA-rwKpHRxTg"
OTGRUZKI_SHEET_ID = "1nLyxuX1W_GSn-GkuiLgea-_QErB8cqkSYqv1UrZwBF8"

SVODNAYA_HEADERS = ['№', 'Название товара', 'Штрихкоды', 'Кол-во (шт)',
                    'Вес 1 шт', 'Общий вес', 'Склады']


def parse_pack_kg(name: str) -> float:
    """Распарсить вес одной упаковки из названия."""
    s = str(name).lower()
    m = re.search(r'(\d{2,4})\s*(?:гр|г\b|г\s|г$|г,|г\.)', s)
    if m: return int(m.group(1)) / 1000
    m = re.search(r'(?:^|\s)(\d{2,4})\s*$', s)
    if m: return int(m.group(1)) / 1000
    if 'кг' in s or '1000' in s: return 1.0
    return 0.1


def write_svodnaya(gc: gspread.Client, ship_date_str: str, ip_name: str,
                    by_sku: dict[int, dict]) -> str:
    """Записать сводную в лист «ИП <name> <date>».

    by_sku: {sku: {'qty': int, 'whs': set[str], 'name': str, 'shk': str}}
    Returns: URL спредшита.
    """
    sh = gc.open_by_key(SVODNAYA_SHEET_ID)
    sheet_name = f"ИП {ip_name} {ship_date_str}"
    try:
        ws = sh.worksheet(sheet_name)
        ws.clear()
        log.info(f"Перезаписан лист «{sheet_name}»")
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=sheet_name, rows=str(len(by_sku) + 5), cols="8")

    rows = []
    sorted_skus = sorted(by_sku.items(), key=lambda x: -x[1]['qty'])
    for i, (sku, info) in enumerate(sorted_skus, 1):
        pack = parse_pack_kg(info['name'])
        rows.append({
            '№': i, 'Название товара': info['name'], 'Штрихкоды': info['shk'],
            'Кол-во (шт)': info['qty'], 'Вес 1 шт': f"{pack:.3f} кг",
            'Общий вес': f"{info['qty']*pack:.3f} кг",
            'Склады': ', '.join(sorted(info['whs'])),
        })
    df = pd.DataFrame(rows)
    values = [SVODNAYA_HEADERS] + df[SVODNAYA_HEADERS].astype(str).values.tolist()
    ws.update(values=values, range_name='A1')
    log.info(f"  Сводная {ip_name}: {len(df)} SKU, {df['Кол-во (шт)'].sum()} шт")
    return f"https://docs.google.com/spreadsheets/d/{SVODNAYA_SHEET_ID}/edit"


def write_otgruzki_tseh(gc: gspread.Client, ship_date_str: str,
                         entries: list[dict],
                         artikul_map: Optional[dict[str, str]] = None) -> str:
    """Добавить строки в «Отгрузки Цех» после последней заполненной.

    entries: список словарей {'ip', 'qty', 'artikul_catalog', 'warehouse'}
    artikul_map: catalog_name → Goods_name (если требуется ремап)
    """
    sh = gc.open_by_key(OTGRUZKI_SHEET_ID)
    ws = sh.worksheet("Отгрузки Цех")
    col_b = ws.col_values(2)
    last_filled = next((i + 1 for i in range(len(col_b) - 1, -1, -1) if col_b[i].strip()), 0)
    start_row = last_filled + 1

    artikul_map = artikul_map or {}
    rows = []
    for i, e in enumerate(entries):
        row_n = start_row + i
        artikul = artikul_map.get(e['artikul_catalog'], e['artikul_catalog'])
        rows.append([
            'FALSE', ship_date_str, 'OZON', f"ИП {e['ip']}",
            f"=VLOOKUP(I{row_n};Goods!$F:$G;2;0)",
            f"=VLOOKUP(E{row_n};Goods!$A:$C;3;0)",
            f"=VLOOKUP(E{row_n};'Кратность'!$B:$C;2;0)",
            int(e['qty']), artikul, '', '', e['warehouse'],
            f"=H{row_n}/G{row_n}",
        ])

    end_row = start_row + len(rows) - 1
    ws.update(values=rows, range_name=f'A{start_row}:M{end_row}',
              value_input_option='USER_ENTERED')
    log.info(f"  Отгрузки Цех: {len(rows)} строк A{start_row}:M{end_row}")
    return f"https://docs.google.com/spreadsheets/d/{OTGRUZKI_SHEET_ID}/edit?gid=1757994986"


# ─────────────────────────────────────────────────────────────────────────────
# Default Артикул-маппинг (catalog Название_цех → Goods артикул)
# Используется когда имя в каталоге Справочник_SKU не совпадает с Goods
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_ARTIKUL_MAP = {
    'Халва Узбекская "Сливочная", 500гр озон': 'помадка 500 г',
    'Паста Фисташковая десертная, 200гр': 'фисташка дес',
    'Паста Фисташковая натуральная, 200гр': 'фисташка нат',
    'Яблоко сушеное зефирное, 90гр озон': 'apple',
    'Кешью в соленой карамели, 500гр озон': 'кешью в карамели 500 г',
    'Клубника сушеная 150': 'клубника 150',
    'арахис сметана лук 500': 'арахис в корочке сметлук 500',
    'грецкий орех 500 г': 'Грецкий орех 500 г',
    'смесь нут 150': 'смесь_нут/кукуруза',
    'Клубника сушеная 250': 'клубника 250 г',
    'Фисташки жар сол 1000': 'фисташки сол 1000 г',
    'фисташка сол 500': 'фисташки сол 500',
    'Фундук жар 500': 'фундук жар 500',
    'Кешью очищенный сырой WW320': 'кешью суш 500',
    'Кешью соленая карамель, кукуруза соленая': 'Смесь пряная',
    'Смесь из орехов и изюма, 100г.': 'смеськлуб100',
    'Фундук очищенный': 'Фундук суш 500 г',
    'арахис барбекю весовой': 'Орехи жареный арахис в корочке барбекю, 1000 г',
    'арахис васаби весовой': 'Орехи жареный арахис в корочке васаби, 1000 г',
    'арахис сырный весовой': 'арахис в корочке сыр 500',
    # Лебедев
    'Кокосовая стружка, 150гр': 'Стружка кокоса, 150гр',
    'Шоколадная паста с фундуком десертная, 200гр озон': 'Nuttela',
    'Лепестки фисташки, 80гр озон': 'лепестки фисташки',
    'Матча, 100гр озон': 'матча 100',
    'Молочная (Японский чай ходзича), 30гр': 'ходзича молочная',
    'Шоколад (Японский чай ходзича), 30гр': 'ходзича шоколад',
    'Масала (Японский чай ходзича), 30гр': 'ходзича масала',
    'Мармелад желейно-фруктовый Апельсиновый 450 гр': 'Мармелад Апельсин',
    'Мармелад желейно-фруктовый Лимонный  450 гр': 'Мармелад Лимон',
}
