"""Запись плана заявок в Google Sheet.

Два листа:
  План_заявок    — сырые данные (append, история всех запусков)
  Просмотр_плана — форматированный вид для утверждения (перезаписывается каждый раз)
"""
from datetime import date
import pandas as pd
import gspread
from src.sources.catalog import get_gspread_client
from src.config import GOOGLE_SHEET_ID
from src.logger import get_logger

log = get_logger(__name__)

PLAN_SHEET      = "План_заявок"
PLAN_VIEW_SHEET = "Просмотр_плана"
LOG_SHEET       = "Лог_расчётов"

PLAN_HEADERS = [
    "Дата_отгрузки", "Кластер", "Склад", "ШК", "Артикул", "Шт", "Коробов",
    "Остаток_цех_после", "Дни_запаса_до", "Дни_запаса_после", "Комментарий", "Одобрено",
]

# ── Цвета ─────────────────────────────────────────────────────────────────────
_CLR_CLUSTER   = {"red": 0.23, "green": 0.51, "blue": 0.77}   # синий заголовок кластера
_CLR_COL_HDR   = {"red": 0.85, "green": 0.90, "blue": 0.95}   # светло-синий шапка колонок
_CLR_CRITICAL  = {"red": 1.00, "green": 0.89, "blue": 0.89}   # розовый критичные
_CLR_NORMAL    = {"red": 1.00, "green": 1.00, "blue": 1.00}   # белый обычные
_CLR_TOTAL     = {"red": 0.94, "green": 0.94, "blue": 0.94}   # серый итого
_CLR_WHITE_TXT = {"red": 1.00, "green": 1.00, "blue": 1.00}
_CLR_DARK_TXT  = {"red": 0.13, "green": 0.13, "blue": 0.13}


def _get_or_create_sheet(sh: gspread.Spreadsheet, name: str) -> gspread.Worksheet:
    try:
        return sh.worksheet(name)
    except gspread.WorksheetNotFound:
        return sh.add_worksheet(title=name, rows=500, cols=15)


def _get_sheet(gc: gspread.Client, name: str) -> gspread.Worksheet:
    sh = gc.open_by_key(GOOGLE_SHEET_ID)
    return sh.worksheet(name)


def _cell_fmt(bg: dict, bold=False, txt: dict | None = None,
              halign="LEFT", size=10) -> dict:
    return {
        "backgroundColor": bg,
        "textFormat": {
            "bold": bold,
            "fontSize": size,
            "foregroundColor": txt or _CLR_DARK_TXT,
        },
        "horizontalAlignment": halign,
        "verticalAlignment": "MIDDLE",
    }


# ── Сырой лист (история) ──────────────────────────────────────────────────────
def write_plan(df: pd.DataFrame, ship_date: date, run_id: str,
               gc: gspread.Client | None = None) -> None:
    if gc is None:
        gc = get_gspread_client()

    ws = _get_sheet(gc, PLAN_SHEET)
    existing = ws.get_all_values()
    if not existing or existing[0] != PLAN_HEADERS:
        ws.clear()
        ws.append_row(PLAN_HEADERS)

    rows = []
    for _, r in df[df["allocated_qty"] > 0].iterrows():
        comment = "low_confidence" if r.get("low_confidence") else ""
        if r.get("is_critical"):
            comment = ("КРИТИЧНО; " + comment).strip("; ")
        rows.append([
            ship_date.strftime("%d.%m.%Y"),
            r.get("cluster", ""),
            r.get("warehouse_name", ""),
            r.get("ШК", ""),
            r.get("article", r.get("Артикул_Ozon", "")),
            int(r["allocated_qty"]),
            int(r["allocated_qty"] / max(r.get("Кратность", 1), 1)),
            round(r.get("factory_remaining", 0), 1),
            round(r.get("days_of_stock", 0), 1),
            round(r.get("days_after", 0), 1),
            comment,
            False,
        ])

    if rows:
        ws.append_rows(rows, value_input_option="USER_ENTERED")
        log.info("Written %d plan rows to Google Sheet (run_id=%s)", len(rows), run_id)
    else:
        log.info("No rows to write to plan (run_id=%s)", run_id)


# ── Лист просмотра / утверждения ──────────────────────────────────────────────
VIEW_COLS = [
    "Название",           # A
    "ШК",                 # B
    "!",                  # C  критично
    "Название_Ozon",      # D  (скрытая, для ссылки)
    "Шт_план",            # E
    "Правка_шт",          # F  редактируемая
    "Коробов",            # G
    "Дни_до",             # H
    "Дни_после",          # I
    "Остаток_цех",        # J  (статус кластера — в строке кластера тоже J)
    "Маркер",             # K  CLUSTER_ROW / ITEM_ROW / TOTAL_ROW (скрытая)
    "Тип_строки",         # L  CRITICAL / NORMAL (скрытая)
]
N_COLS = len(VIEW_COLS)   # 12


def write_plan_view(df: pd.DataFrame, ship_date: date, run_id: str,
                    gc: gspread.Client | None = None) -> None:
    """Пишет форматированный вид плана для утверждения."""
    if gc is None:
        gc = get_gspread_client()

    sh = gc.open_by_key(GOOGLE_SHEET_ID)
    ws = _get_or_create_sheet(sh, PLAN_VIEW_SHEET)
    ws.clear()

    plan_rows = df[df["allocated_qty"] > 0].copy()
    if plan_rows.empty:
        ws.update("A1", [["Нет позиций для отгрузки"]])
        return

    # Группируем по кластеру
    clusters = plan_rows["cluster"].fillna("Без кластера").unique()
    all_rows: list[list] = []          # данные для записи
    fmt_requests: list[dict] = []      # запросы форматирования
    validation_requests: list[dict] = []

    sheet_id = ws.id

    def _row_idx(r: int) -> int:
        """1-based row index."""
        return r + 1   # all_rows is 0-based → sheet is 1-based

    # Заголовок листа
    ship_str = ship_date.strftime("%d.%m.%Y")
    all_rows.append([
        f"📦 План поставки  {ship_str}   run: {run_id}",
        "", "", "", "", "", "", "", "", "", "", "",
    ])
    fmt_requests.append({
        "repeatCell": {
            "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": N_COLS},
            "cell": {"userEnteredFormat": _cell_fmt(
                {"red": 0.13, "green": 0.13, "blue": 0.13}, bold=True,
                txt=_CLR_WHITE_TXT, size=11)},
            "fields": "userEnteredFormat",
        }
    })
    fmt_requests.append({
        "mergeCells": {
            "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": 6},
            "mergeType": "MERGE_ALL",
        }
    })

    total_qty_all = 0
    total_boxes_all = 0

    for cluster in sorted(clusters):
        cdf = plan_rows[plan_rows["cluster"].fillna("Без кластера") == cluster]
        cluster_start = len(all_rows)

        # ── Строка кластера ──────────────────────────────────────────────
        c_qty = int(cdf["allocated_qty"].sum())
        c_boxes = int((cdf["allocated_qty"] / cdf["Кратность"].clip(lower=1)).sum())
        critical_cnt = int(cdf["is_critical"].sum())
        crit_label = f"  🚨 {critical_cnt} критичных" if critical_cnt else ""
        all_rows.append([
            f"📍 {cluster}",
            f"Отгрузка {ship_str}",
            f"{c_qty} шт / {c_boxes} кор{crit_label}",
            "", "", "", "", "", "",
            "⏳ Ожидает",   # J — статус кластера, редактируемый
            "CLUSTER_ROW",  # K — маркер
            "",             # L
        ])
        cluster_row_idx = len(all_rows) - 1  # 0-based

        # Форматирование строки кластера
        fmt_requests.append({
            "repeatCell": {
                "range": {"sheetId": sheet_id,
                          "startRowIndex": cluster_row_idx,
                          "endRowIndex": cluster_row_idx + 1,
                          "startColumnIndex": 0, "endColumnIndex": 10},
                "cell": {"userEnteredFormat": _cell_fmt(
                    _CLR_CLUSTER, bold=True, txt=_CLR_WHITE_TXT, size=10)},
                "fields": "userEnteredFormat",
            }
        })
        # Merge первых 3 ячеек для названия кластера
        fmt_requests.append({
            "mergeCells": {
                "range": {"sheetId": sheet_id,
                          "startRowIndex": cluster_row_idx,
                          "endRowIndex": cluster_row_idx + 1,
                          "startColumnIndex": 0, "endColumnIndex": 3},
                "mergeType": "MERGE_ALL",
            }
        })
        # Data validation для статуса кластера (col J = index 9)
        validation_requests.append({
            "setDataValidation": {
                "range": {"sheetId": sheet_id,
                          "startRowIndex": cluster_row_idx,
                          "endRowIndex": cluster_row_idx + 1,
                          "startColumnIndex": 9, "endColumnIndex": 10},
                "rule": {
                    "condition": {
                        "type": "ONE_OF_LIST",
                        "values": [
                            {"userEnteredValue": "⏳ Ожидает"},
                            {"userEnteredValue": "✅ Утверждено"},
                            {"userEnteredValue": "❌ Отклонено"},
                        ],
                    },
                    "showCustomUi": True,
                    "strict": True,
                },
            }
        })

        # ── Шапка колонок ───────────────────────────────────────────────
        hdr_idx = len(all_rows)
        all_rows.append([
            "Название", "ШК", "!", "Название_Ozon",
            "Шт план", "✏️ Правка шт", "Коробов",
            "Дни до", "Дни после", "Остаток цех",
            "", "",
        ])
        fmt_requests.append({
            "repeatCell": {
                "range": {"sheetId": sheet_id,
                          "startRowIndex": hdr_idx, "endRowIndex": hdr_idx + 1,
                          "startColumnIndex": 0, "endColumnIndex": 10},
                "cell": {"userEnteredFormat": _cell_fmt(_CLR_COL_HDR, bold=True)},
                "fields": "userEnteredFormat",
            }
        })

        # ── Строки товаров ───────────────────────────────────────────────
        for _, r in cdf.iterrows():
            is_crit = bool(r.get("is_critical", False))
            qty = int(r["allocated_qty"])
            krat = max(int(r.get("Кратность", 1)), 1)
            boxes = qty // krat
            item_row_idx = len(all_rows)
            all_rows.append([
                str(r.get("Название_Ozon", r.get("Название_цех", ""))),   # A
                str(r.get("ШК", "")),                                       # B
                "🚨" if is_crit else "",                                    # C
                str(r.get("Название_Ozon", "")),                            # D
                qty,                                                         # E
                "",                                                          # F — Правка_шт
                boxes,                                                       # G
                round(float(r.get("days_of_stock", 0)), 1),                 # H
                round(float(r.get("days_after", 0)), 1),                    # I
                round(float(r.get("factory_remaining", 0)), 1),             # J
                "ITEM_ROW",                                                  # K
                "CRITICAL" if is_crit else "NORMAL",                        # L
            ])
            bg = _CLR_CRITICAL if is_crit else _CLR_NORMAL
            fmt_requests.append({
                "repeatCell": {
                    "range": {"sheetId": sheet_id,
                              "startRowIndex": item_row_idx,
                              "endRowIndex": item_row_idx + 1,
                              "startColumnIndex": 0, "endColumnIndex": 10},
                    "cell": {"userEnteredFormat": _cell_fmt(bg)},
                    "fields": "userEnteredFormat",
                }
            })

        # ── Итого по кластеру ────────────────────────────────────────────
        total_idx = len(all_rows)
        all_rows.append([
            f"Итого по кластеру:", "", "", "", c_qty, "", c_boxes,
            "", "", "", "TOTAL_ROW", "",
        ])
        fmt_requests.append({
            "repeatCell": {
                "range": {"sheetId": sheet_id,
                          "startRowIndex": total_idx,
                          "endRowIndex": total_idx + 1,
                          "startColumnIndex": 0, "endColumnIndex": 10},
                "cell": {"userEnteredFormat": _cell_fmt(_CLR_TOTAL, bold=True)},
                "fields": "userEnteredFormat",
            }
        })

        # Пустая строка-разделитель
        all_rows.append([""] * N_COLS)

        total_qty_all += c_qty
        total_boxes_all += c_boxes

    # ── Итоговая строка всего плана ──────────────────────────────────────
    grand_idx = len(all_rows)
    all_rows.append([
        f"ИТОГО: {len(clusters)} кластеров",
        "", "", "", total_qty_all, "", total_boxes_all,
        "", "", "", "", "",
    ])
    fmt_requests.append({
        "repeatCell": {
            "range": {"sheetId": sheet_id,
                      "startRowIndex": grand_idx, "endRowIndex": grand_idx + 1,
                      "startColumnIndex": 0, "endColumnIndex": 10},
            "cell": {"userEnteredFormat": _cell_fmt(
                {"red": 0.13, "green": 0.13, "blue": 0.13},
                bold=True, txt=_CLR_WHITE_TXT)},
            "fields": "userEnteredFormat",
        }
    })

    # ── Запись данных ────────────────────────────────────────────────────
    ws.update(f"A1:L{len(all_rows)}", all_rows, value_input_option="USER_ENTERED")

    # ── Форматирование ───────────────────────────────────────────────────
    body = {"requests": fmt_requests + validation_requests}
    sh.batch_update(body)

    # ── Ширины колонок ───────────────────────────────────────────────────
    col_widths = [220, 130, 25, 1, 65, 80, 65, 55, 65, 85, 1, 1]
    width_requests = [
        {
            "updateDimensionProperties": {
                "range": {"sheetId": sheet_id, "dimension": "COLUMNS",
                          "startIndex": i, "endIndex": i + 1},
                "properties": {"pixelSize": w},
                "fields": "pixelSize",
            }
        }
        for i, w in enumerate(col_widths)
    ]
    # Скрываем служебные колонки D, K, L
    hide_requests = [
        {
            "updateDimensionProperties": {
                "range": {"sheetId": sheet_id, "dimension": "COLUMNS",
                          "startIndex": c, "endIndex": c + 1},
                "properties": {"hiddenByUser": True},
                "fields": "hiddenByUser",
            }
        }
        for c in [3, 10, 11]   # D=3, K=10, L=11
    ]
    sh.batch_update({"requests": width_requests + hide_requests})

    log.info("Written plan view: %d clusters, %d items total (run_id=%s)",
             len(clusters), len(plan_rows), run_id)


def read_approved_plan(gc: gspread.Client | None = None) -> pd.DataFrame:
    """Читает утверждённые строки из Просмотр_плана.

    Возвращает DataFrame [cluster, ШК, qty] только для кластеров со статусом ✅ Утверждено.
    Если есть Правка_шт — берёт её вместо Шт_план.
    """
    if gc is None:
        gc = get_gspread_client()
    sh = gc.open_by_key(GOOGLE_SHEET_ID)
    try:
        ws = sh.worksheet(PLAN_VIEW_SHEET)
    except gspread.WorksheetNotFound:
        return pd.DataFrame(columns=["cluster", "ШК", "qty"])

    data = ws.get_all_values()
    records = []
    current_cluster = None
    is_approved = False

    for row in data:
        if len(row) < 11:
            continue
        marker = row[10]   # col K
        if marker == "CLUSTER_ROW":
            current_cluster = row[0].replace("📍 ", "").strip()
            is_approved = (row[9].strip() == "✅ Утверждено")
        elif marker == "ITEM_ROW" and is_approved:
            bk = row[1]
            qty_plan = row[4]
            qty_edit = row[5]
            try:
                qty = int(qty_edit) if qty_edit else int(qty_plan)
            except (ValueError, TypeError):
                qty = 0
            if qty > 0:
                records.append({
                    "cluster": current_cluster,
                    "ШК": bk,
                    "qty": qty,
                    "Название": row[0],
                })

    df = pd.DataFrame(records)
    if not df.empty:
        log.info("Read %d approved rows from plan view (%d clusters)",
                 len(df), df["cluster"].nunique())
    return df


def write_log(run_id: str, status: str, message: str,
              gc: gspread.Client | None = None) -> None:
    if gc is None:
        gc = get_gspread_client()
    ws = _get_sheet(gc, LOG_SHEET)
    ws.append_row([run_id, status, message, str(date.today())])
