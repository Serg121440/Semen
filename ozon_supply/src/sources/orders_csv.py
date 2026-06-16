"""Парсинг CSV-выгрузки 'Заказы' из ЛК Ozon.

Формат CSV (новый, с 2025): разделитель ';', utf-8-sig.
Колонка 'Юридическое лицо' = признак B2B-покупателя ('нет'/'да'),
а НЕ продавец — каждый аккаунт выгружает только свои заказы.
Фильтрация по продавцу делается через параметр known_skus (из Справочника).
"""
from pathlib import Path
import pandas as pd
from src.logger import get_logger

log = get_logger(__name__)

# Обязательные колонки для расчётов
REQUIRED_COLS = {"Принят в обработку", "SKU", "Количество", "Кластер доставки", "Склад отгрузки"}

# Опциональные колонки (разные версии выгрузки)
COL_ALIASES = {
    "Артикул": ["Артикул"],
    "Название товара": ["Название товара", "Наименование товара"],
}


def load_orders(
    csv_path: Path,
    legal_entity: str | None = None,      # оставлен для совместимости, но не используется как фильтр
    known_skus: set | None = None,         # фильтр по SKU из Справочника (для мультиаккаунтных CSV)
) -> pd.DataFrame:
    log.info("Loading orders from %s", csv_path)
    df = pd.read_csv(csv_path, sep=";", encoding="utf-8-sig", dtype={"SKU": str})

    # Нормализуем дату
    if "Принят в обработку" in df.columns:
        df["Принят в обработку"] = pd.to_datetime(
            df["Принят в обработку"], dayfirst=False, errors="coerce"
        )

    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in orders CSV: {missing}. Available: {list(df.columns)}")

    # Разрешаем альтернативные имена колонок
    for canonical, aliases in COL_ALIASES.items():
        for alias in aliases:
            if alias in df.columns and canonical not in df.columns:
                df = df.rename(columns={alias: canonical})

    df = df.rename(columns={
        "Принят в обработку": "order_date",
        "SKU": "sku",
        "Артикул": "article",
        "Количество": "quantity",
        "Кластер доставки": "cluster",
        "Склад отгрузки": "warehouse",
    })
    if "Название товара" in df.columns:
        df = df.rename(columns={"Название товара": "name"})
    if "article" not in df.columns:
        df["article"] = ""

    df["sku"] = df["sku"].astype(str).str.strip()
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce").fillna(0).astype(int)
    df["legal_entity"] = legal_entity or "unknown"

    # Фильтр по известным SKU (если передан)
    if known_skus:
        before = len(df)
        df = df[df["sku"].isin({str(s) for s in known_skus})].copy()
        log.info("SKU filter: %d → %d rows (kept %d known SKUs)",
                 before, len(df), df["sku"].nunique())

    # Отбрасываем строки с нечитаемой датой
    df = df.dropna(subset=["order_date"])

    log.info("Loaded %d order rows from %s", len(df), csv_path.name)
    cols = ["order_date", "sku", "article", "quantity", "cluster", "warehouse", "legal_entity"]
    return df[[c for c in cols if c in df.columns]]


def save_orders_to_db(df: pd.DataFrame, run_id: str, conn) -> None:
    rows = df.copy()
    rows["run_id"] = run_id
    rows["order_date"] = pd.to_datetime(rows["order_date"]).dt.strftime("%Y-%m-%d")
    rows.to_sql("orders", conn, if_exists="append", index=False)
    log.info("Saved %d order rows (run_id=%s)", len(rows), run_id)
