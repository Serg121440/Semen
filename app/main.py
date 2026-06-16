import os
import sys
from pathlib import Path

import uvicorn

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def main() -> None:
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.web_api:api", host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
