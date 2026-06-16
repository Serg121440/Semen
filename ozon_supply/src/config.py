import os
from pathlib import Path
import yaml
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = BASE_DIR / "db" / "history.db"
LOGS_DIR = BASE_DIR / "logs"
CREDS_DIR = BASE_DIR / "creds"


def load_config() -> dict:
    with open(BASE_DIR / "config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


CFG = load_config()

GOOGLE_SHEET_ID = os.environ["GOOGLE_SHEET_ID"]
GOOGLE_SHEETS_CREDS_PATH = os.environ.get(
    "GOOGLE_SHEETS_CREDS_PATH", str(CREDS_DIR / "service_account.json")
)
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


def get_ozon_credentials(account: str) -> tuple[str, str]:
    """Return (client_id, api_key) for the given account name."""
    prefix = CFG["ip_accounts"][account]["api_keys_env_prefix"]
    client_id = os.environ[f"{prefix}_CLIENT_ID"]
    api_key = os.environ[f"{prefix}_API_KEY"]
    return client_id, api_key
