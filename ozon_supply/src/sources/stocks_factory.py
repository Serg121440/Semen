"""Парсер остатков цеха из 1С-отчётов.

Поддерживает два формата:

1. «Остатки ТМЦ» (xlsx) — иерархический:
     Организация → Склад → [Номенклатура  qty  price  total]
   Колонки: [name, qty, price, total]  (unit отсутствует)

2. «Остатки товаров» (xls) — плоский:
     Склад маркетплейсов_Готовая Продукция
       Товар А   шт   10
       Готовая продукция     10      ← тип счёта
       Сергашов С. Н. ИП    10      ← организация
       Товар Б   шт   5
       ...
   Колонки: [name, unit, qty, sum]  (unit = шт/кг)

Для расчёта поставки используем:
  - Готовая Продукция (шт) → напрямую как запас
  - Сырьё (кг) → через BOM → штуки составных товаров
"""
from pathlib import Path
import pandas as pd
from src.logger import get_logger

log = get_logger(__name__)

# Ключевые слова для "Готовая продукция" (штуки)
FINISHED_GOODS_KEYWORDS = {"готовая продукция", "готовой продукции"}

# Ключевые слова для "сырьё/компоненты в кг"
RAW_MATERIAL_KEYWORDS = {
    "сырье", "сырьё", "производство", "резервный", "основной", "комплектующие",
    "маркетплейсов _основной", "маркетплейсов _резервный",
}

# Единицы измерения штучные
PIECE_UNITS = {"шт", "уп", "упак", "пачка", "box"}
# Единицы измерения весовые
WEIGHT_UNITS = {"кг", "г", "л", "мл", "kg", "g"}

# Типы счетов 1С (строки-маркеры после товарной строки в формате 2)
ACCOUNT_TYPES = {"готовая продукция", "сырье и материалы", "сырьё и материалы",
                 "полуфабрикаты", "незавершенное производство"}

# ИП/ООО маркеры для определения строки-организации
ORG_MARKERS = ("ООО", " ИП", "ИП ", "С. Н.", "Д. С.", "АО", "ЗАО", "ПАО")


# ─────────────────────────────────────────────────────────────────────────────
# Формат 1: «Остатки ТМЦ» (xlsx, иерархический)
# ─────────────────────────────────────────────────────────────────────────────

def _is_section_header(row: tuple) -> bool:
    """True если строка — заголовок организации/склада (нет qty и price)."""
    return (
        row[0] is not None
        and row[1] is None
        and row[2] is None
    )


def _is_item_row(row: tuple) -> bool:
    """True если строка — товарная позиция с количеством."""
    return row[0] is not None and row[1] is not None


def parse_report(xlsx_path: Path) -> dict:
    """
    Парсит 1С-отчёт и возвращает вложенный словарь:
      {org_name: {warehouse_name: {item_name: qty}}}
    """
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    raw_rows = [
        tuple(cell.value for cell in row)
        for row in ws.iter_rows()
        if any(cell.value is not None for cell in row)
    ]

    # Пропускаем строки-заголовки до "Организация"
    start = 0
    for i, r in enumerate(raw_rows):
        if r[0] == "Организация":
            start = i + 1
            break

    result: dict = {}
    current_org: str | None = None
    current_wh: str | None = None

    # Признаки организации: ООО, ИП, АО, ЗАО, ПАО, ПАО и т.д.
    ORG_KEYWORDS = ("ООО", " ИП", "ИП ", "АО", "ЗАО", "ПАО", "ОАО", "НКО")
    # Признаки склада: начинается с "Склад" или содержит служебные маркеры
    WH_KEYWORDS = ("Склад", "Цех", "ЛиП-", "Основной склад")

    for row in raw_rows[start:]:
        name = str(row[0]).strip() if row[0] else ""
        if not name or name.startswith("Итого"):
            continue

        if _is_section_header(row):
            is_warehouse = any(name.startswith(kw) or kw in name
                               for kw in WH_KEYWORDS)
            is_org = any(kw in name for kw in ORG_KEYWORDS)

            if is_warehouse:
                current_wh = name
                if current_org is not None:
                    result.setdefault(current_org, {}).setdefault(current_wh, {})
            elif is_org:
                current_org = name
                current_wh = None
                result.setdefault(current_org, {})
            # else: партия / субгруппа — игнорируем, org/wh не меняем
        elif _is_item_row(row):
            if current_org is None or current_wh is None:
                continue
            try:
                qty = float(row[1])
            except (TypeError, ValueError):
                continue
            existing = result[current_org][current_wh].get(name, 0)
            result[current_org][current_wh][name] = existing + qty

    log.info("Parsed 1C report: %d orgs, %d total warehouses",
             len(result),
             sum(len(whs) for whs in result.values()))
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Формат 2: «Остатки товаров» (xls, плоский)
# ─────────────────────────────────────────────────────────────────────────────

def parse_report_xls(xls_path: Path, ip_filter: str = "Сергашов") -> dict:
    """Парсит XLS-отчёт «Остатки товаров» из 1С.

    Структура каждой товарной записи (3 строки):
      [Название  | Ед | Кол-во | Сумма]   ← товар
      [Тип счёта |    | Кол-во | Сумма]   ← "Готовая продукция" / "Сырье и материалы"
      [Орг.      |    | Кол-во | Сумма]   ← "ИП Сергашов" / "Лебедев" / "НУТТРЕЙД"

    ip_filter: если задан — для Готовой Продукции берём только строки этого ИП.
               Для сырья берём всё (сырьё принадлежит НУТТРЕЙД, общий пул).

    Возвращает {warehouse_name: {item_name: {"qty": float, "unit": str}}}
    """
    try:
        import xlrd
    except ImportError:
        raise ImportError(
            "xlrd required for .xls files: "
            "pip install xlrd --trusted-host pypi.org --trusted-host files.pythonhosted.org"
        )

    wb = xlrd.open_workbook(str(xls_path))
    ws = wb.sheet_by_index(0)

    result: dict[str, dict] = {}
    current_wh: str | None = None

    rows = []
    for i in range(ws.nrows):
        row = [ws.cell_value(i, j) for j in range(ws.ncols)]
        rows.append(row)

    i = 0
    while i < len(rows):
        row = rows[i]
        name = str(row[0]).strip() if row[0] else ""
        unit = str(row[1]).strip().lower() if row[1] else ""
        raw_qty = row[2]

        if not name:
            i += 1
            continue

        # Строка-заголовок склада: col[1] пустой, col[2] пустой или сумма без unit
        if name.startswith("Склад") and not unit:
            current_wh = name
            result.setdefault(current_wh, {})
            i += 1
            continue

        # Игнорируем итоговые и заголовочные строки
        if (name in ("Организация", "Номенклатура", "Счет")
                or name.startswith("Итого")
                or name.startswith("Остатки товаров")):
            i += 1
            continue

        # Товарная строка: есть unit (шт/кг/...) и числовое qty
        if unit and current_wh is not None:
            try:
                qty = float(raw_qty)
            except (TypeError, ValueError):
                i += 1
                continue

            # Читаем следующие строки: account_type и org
            account_type = ""
            org_name = ""
            if i + 1 < len(rows):
                next1 = rows[i + 1]
                n1 = str(next1[0]).strip() if next1[0] else ""
                if n1.lower() in ACCOUNT_TYPES:
                    account_type = n1.lower()
                    if i + 2 < len(rows):
                        next2 = rows[i + 2]
                        n2 = str(next2[0]).strip() if next2[0] else ""
                        if any(m in n2 for m in ORG_MARKERS) or any(
                            m in n2 for m in ("НУТТРЕЙД", "нуттрейд")
                        ):
                            org_name = n2
                            i += 3
                        else:
                            i += 2
                    else:
                        i += 2
                else:
                    i += 1
            else:
                i += 1

            if qty <= 0:
                continue

            # Фильтрация по ИП для готовой продукции
            is_finished = account_type in ("готовая продукция", "готовой продукции")
            is_raw      = not is_finished  # всё остальное — сырьё/полуфабрикат

            if is_finished and ip_filter and ip_filter not in org_name:
                continue  # чужая готовая продукция — пропускаем

            existing = result[current_wh].get(name, {"qty": 0.0, "unit": unit})
            existing["qty"] += qty
            result[current_wh][name] = existing
            continue

        i += 1

    log.info("Parsed XLS report: %d warehouses, %d total positions",
             len(result),
             sum(len(v) for v in result.values()))
    return result


def _xls_report_to_standard(
    xls_result: dict[str, dict]
) -> tuple[dict[str, float], dict[str, float]]:
    """Конвертирует результат parse_report_xls в (finished_pcs, raw_kg)."""
    finished: dict[str, float] = {}
    raw: dict[str, float] = {}

    for wh_name, items in xls_result.items():
        wh_lower = wh_name.lower()
        is_finished_wh = any(kw in wh_lower for kw in FINISHED_GOODS_KEYWORDS)
        is_raw_wh      = any(kw in wh_lower for kw in RAW_MATERIAL_KEYWORDS)

        for item_name, data in items.items():
            qty  = data["qty"]
            unit = data["unit"]
            if qty <= 0:
                continue

            if unit in PIECE_UNITS or is_finished_wh:
                finished[item_name] = finished.get(item_name, 0) + qty
            elif unit in WEIGHT_UNITS or is_raw_wh:
                raw[item_name] = raw.get(item_name, 0) + qty

    return finished, raw


def load_factory_stocks(xlsx_path: Path, bom: dict | None = None) -> pd.DataFrame:
    """
    Загружает остатки цеха из 1С-отчёта.

    Возвращает DataFrame [name_factory, quantity, unit]:
      - unit='pcs': штуки готовой продукции (из "*Готовая Продукция*" складов)
      - unit='kg':  кг сырья (остальные склады)

    Если передан bom, дополнительно вычисляет штуки составных товаров из сырья.
    """
    log.info("Loading factory stocks from %s", xlsx_path)
    suffix = Path(xlsx_path).suffix.lower()

    finished: dict[str, float] = {}   # name → штуки
    raw: dict[str, float] = {}        # name → кг (все сырьевые склады суммарно)

    if suffix == ".xls":
        # Формат 2: «Остатки товаров» (XLS, плоский)
        xls_result = parse_report_xls(xlsx_path)
        finished, raw = _xls_report_to_standard(xls_result)
    else:
        # Формат 1: «Остатки ТМЦ» (XLSX, иерархический)
        report = parse_report(xlsx_path)
        for org_name, warehouses in report.items():
            for wh_name, items in warehouses.items():
                wh_lower = wh_name.lower()
                is_finished = any(kw in wh_lower for kw in FINISHED_GOODS_KEYWORDS)
                is_raw = any(kw in wh_lower for kw in RAW_MATERIAL_KEYWORDS)
                for item_name, qty in items.items():
                    if qty <= 0:
                        continue
                    if is_finished:
                        finished[item_name] = finished.get(item_name, 0) + qty
                    elif is_raw:
                        raw[item_name] = raw.get(item_name, 0) + qty

    log.info("Finished goods (pcs): %d positions", len(finished))
    log.info("Raw materials (kg): %d positions", len(raw))

    # BOM-расчёт: из сырья → дополнительные штуки составных товаров
    if bom:
        producible = _calc_producible(raw, bom)
        for name, qty in producible.items():
            if qty > 0:
                log.info("BOM producible: %s → %d шт", name, qty)
                finished[name] = finished.get(name, 0) + qty

    # Собираем итоговый DataFrame
    records = []
    for name, qty in finished.items():
        records.append({"name_factory": name, "quantity": qty, "unit": "pcs"})
    for name, qty in raw.items():
        records.append({"name_factory": name, "quantity": qty, "unit": "kg"})

    if not records:
        raise ValueError(
            f"Cannot find stock data in {xlsx_path}. "
            "Check that the file is a valid 1C 'Остатки ТМЦ' report."
        )

    df = pd.DataFrame(records)
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce").fillna(0)
    log.info("Total factory rows: %d (%d pcs + %d kg)",
             len(df),
             (df["unit"] == "pcs").sum(),
             (df["unit"] == "kg").sum())
    return df


def _calc_producible(raw: dict[str, float], bom: dict) -> dict[str, float]:
    """Рассчитывает сколько штук каждого составного товара можно собрать из сырья.

    bom: {product_name: {component_name: kg_per_unit}}
    """
    result: dict[str, float] = {}
    for product, recipe in bom.items():
        if not recipe:
            continue
        max_units: float = float("inf")
        for component, kg_per_unit in recipe.items():
            available = raw.get(component, 0.0)
            if kg_per_unit > 0:
                max_units = min(max_units, available / kg_per_unit)
            else:
                max_units = 0.0
        result[product] = int(max_units) if max_units != float("inf") else 0
    return result


def save_factory_stocks_to_db(df: pd.DataFrame, run_id: str, conn) -> None:
    rows = df.copy()
    rows["run_id"] = run_id
    rows.to_sql("stocks_factory", conn, if_exists="append", index=False)
    log.info("Saved %d factory stock rows (run_id=%s)", len(rows), run_id)
