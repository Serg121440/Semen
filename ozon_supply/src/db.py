import sqlite3
from pathlib import Path
from src.config import DB_PATH


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                order_date TEXT,
                sku TEXT,
                article TEXT,
                quantity INTEGER,
                cluster TEXT,
                warehouse TEXT,
                legal_entity TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS stocks_ozon (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                sku TEXT,
                warehouse_id INTEGER,
                warehouse_name TEXT,
                cluster_id INTEGER,
                cluster_name TEXT,
                free_to_sell INTEGER,
                in_transit INTEGER,
                requested INTEGER,
                turnover_grade TEXT,
                ads_daily REAL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS stocks_factory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                name_factory TEXT,
                quantity REAL,
                unit TEXT DEFAULT 'pcs',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS supply_plan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                ship_date TEXT,
                cluster TEXT,
                warehouse TEXT,
                barcode TEXT,
                article TEXT,
                qty_units INTEGER,
                qty_boxes INTEGER,
                factory_remaining REAL,
                days_before REAL,
                days_after REAL,
                comment TEXT,
                approved INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS run_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT UNIQUE NOT NULL,
                run_type TEXT,
                status TEXT,
                message TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
