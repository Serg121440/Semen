import os

import uvicorn


def main() -> None:
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.web_api:api", host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
