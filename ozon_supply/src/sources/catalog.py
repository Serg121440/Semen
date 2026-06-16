"""Справочник SKU: ШК ↔ Артикул_Ozon ↔ SKU_Ozon ↔ Название_цех."""
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials
from src.config import GOOGLE_SHEET_ID, GOOGLE_SHEETS_CREDS_PATH
from src.logger import get_logger

log = get_logger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

CATALOG_SHEET = "Справочник_SKU"
CATALOG_COLS = ["ШК", "Артикул_Ozon", "SKU_Ozon", "Название_Ozon",
                "Название_цех", "Кратность", "Целевой_запас_дней", "ИП"]

# Значения Название_цех, означающие неактивный товар
_INACTIVE_LABELS = {
    "не продаем",   # архив — перестали продавать
    "нету",         # временно нет на производстве
    "выбыл",        # выбыл из ассортимента
}


def _parse_status(цех: str) -> str:
    """Определяет статус по значению Название_цех."""
    v = str(цех).strip().lower()
    if v in ("не продаем", "выбыл"):
        return "archived"
    if v == "нету":
        return "temp_out"
    return "active"


def get_gspread_client() -> gspread.Client:
    creds = Credentials.from_service_account_file(GOOGLE_SHEETS_CREDS_PATH, scopes=SCOPES)
    return gspread.authorize(creds)


def load_catalog(gc: gspread.Client | None = None) -> pd.DataFrame:
    if gc is None:
        gc = get_gspread_client()
    sh = gc.open_by_key(GOOGLE_SHEET_ID)
    ws = sh.worksheet(CATALOG_SHEET)
    data = ws.get_all_records()
    df = pd.DataFrame(data)

    # Добавляем колонку status
    df["status"] = df["Название_цех"].apply(_parse_status)

    # Если Название_цех — статусная метка, очищаем её чтобы не участвовала в матчинге
    mask_inactive = df["Название_цех"].str.strip().str.lower().isin(_INACTIVE_LABELS)
    df.loc[mask_inactive, "Название_цех"] = ""

    n_active = (df["status"] == "active").sum()
    n_archived = (df["status"] == "archived").sum()
    n_temp = (df["status"] == "temp_out").sum()
    log.info("Loaded %d SKU catalog rows (%d active, %d archived, %d temp_out)",
             len(df), n_active, n_archived, n_temp)
    return df


WAREHOUSE_MAP_SHEET = "Маппинг_складов"


def load_warehouse_map(gc: gspread.Client | None = None) -> dict[str, str]:
    """Читает лист «Маппинг_складов» → возвращает {кластер: склад_Ozon}.

    Ожидаемая структура листа: колонка B = Кластер, колонка C = Склад_Ozon.
    (Первая строка — заголовки, пропускается.)
    Используется для определения warehouse_id при создании поставки через API.
    """
    if gc is None:
        gc = get_gspread_client()
    sh = gc.open_by_key(GOOGLE_SHEET_ID)
    try:
        ws = sh.worksheet(WAREHOUSE_MAP_SHEET)
    except gspread.WorksheetNotFound:
        log.warning("Sheet '%s' not found — falling back to config.yaml warehouse_clusters",
                    WAREHOUSE_MAP_SHEET)
        from src.config import CFG
        return {v: k for k, v in CFG.get("warehouse_clusters", {}).items()}

    data = ws.get_all_values()
    if not data or len(data) < 2:
        log.warning("Sheet '%s' is empty", WAREHOUSE_MAP_SHEET)
        return {}

    # Ищем колонки по заголовку (первая строка)
    headers = [h.strip() for h in data[0]]
    try:
        col_cluster = next(i for i, h in enumerate(headers)
                           if "кластер" in h.lower() or "cluster" in h.lower())
        col_wh      = next(i for i, h in enumerate(headers)
                           if "склад" in h.lower() or "warehouse" in h.lower())
    except StopIteration:
        # Fallback: B=кластер (idx 1), C=склад (idx 2)
        log.warning("Headers not recognised in '%s', using cols B/C", WAREHOUSE_MAP_SHEET)
        col_cluster, col_wh = 1, 2

    result: dict[str, str] = {}
    for row in data[1:]:
        if len(row) <= max(col_cluster, col_wh):
            continue
        cluster = row[col_cluster].strip()
        wh_name = row[col_wh].strip()
        if cluster and wh_name:
            result[cluster] = wh_name

    log.info("Loaded warehouse map: %d cluster→warehouse entries", len(result))
    return result


def get_barcode_by_factory_name(catalog: pd.DataFrame, name: str) -> str | None:
    row = catalog[catalog["Название_цех"].str.lower() == name.lower()]
    if row.empty:
        return None
    return str(row.iloc[0]["ШК"])
