"""Запись одобренных строк в вкладку 'Состав ГМ | YYYY-MM-DD'."""
from datetime import date
import pandas as pd
import gspread
from src.sources.catalog import get_gspread_client
from src.config import GOOGLE_SHEET_ID
from src.logger import get_logger

log = get_logger(__name__)

PLAN_SHEET = "План_заявок"
# Реальный формат листа «Состав ГМ | дата» (по образцу существующих вкладок)
GM_HEADERS = [
    "ШК товара", "Артикул товара", "Кол-во товаров",
    "Зона размещения", "ШК ГМ",
    "Тип ГМ (не обязательно)",
    "Срок годности ДО в формате YYYY-MM-DD (не более 1 СГ на 1 SKU в 1 ГМ)",
]


def get_approved_rows(gc: gspread.Client) -> pd.DataFrame:
    sh = gc.open_by_key(GOOGLE_SHEET_ID)
    ws = sh.worksheet(PLAN_SHEET)
    data = ws.get_all_records()
    df = pd.DataFrame(data)
    if df.empty:
        return df
    approved = df[df["Одобрено"].astype(str).str.upper().isin(["TRUE", "ИСТИНА", "1"])]
    log.info("Found %d approved rows", len(approved))
    return approved


def write_gm_sheet(approved: pd.DataFrame, ship_date: date | None = None,
                   legal_entity: str = "ИП Сергашов",
                   gc: gspread.Client | None = None) -> str:
    """
    Записывает одобренные строки в лист «Состав ГМ | дата».
    Формат соответствует шаблону загрузки FBO в ЛК Ozon.
    """
    if gc is None:
        gc = get_gspread_client()
    if ship_date is None:
        ship_date = date.today()

    sheet_name = f"Состав ГМ | {ship_date.strftime('%d.%m.%Y')}"
    sh = gc.open_by_key(GOOGLE_SHEET_ID)

    try:
        ws = sh.worksheet(sheet_name)
        ws.clear()
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(sheet_name, rows=500, cols=len(GM_HEADERS))

    # Строка-заголовок поставки (как в существующих листах)
    supply_header = f"→ ПОСТАВКА: {legal_entity} | {ship_date.strftime('%d.%m.%Y')}"
    ws.append_row([supply_header] + [""] * (len(GM_HEADERS) - 1))
    ws.append_row(GM_HEADERS)
    ws.append_row([])  # пустая строка-разделитель

    rows = []
    for _, r in approved.iterrows():
        rows.append([
            str(r.get("ШК", "")),            # ШК товара
            str(r.get("Артикул", "")),        # Артикул товара
            int(r.get("Шт", 0)),              # Кол-во товаров
            "",                               # Зона размещения (заполняется вручную / Apps Script)
            "",                               # ШК ГМ (заполняется вручную / Apps Script)
            "Коробка",                        # Тип ГМ
            "",                               # Срок годности (заполняется вручную при необходимости)
        ])

    if rows:
        ws.append_rows(rows, value_input_option="USER_ENTERED")

    log.info("Written %d rows to '%s'", len(rows), sheet_name)
    return sheet_name
