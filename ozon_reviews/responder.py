"""Ответы на отзывы покупателей через Ozon Seller API (магазин «4 сыночка»).

Нужна подписка Premium Plus / Premium Pro (иначе API отзывов вернёт 403).
По умолчанию работает в режиме dry-run: ответы только печатаются.

Запуск:
    python -m ozon_reviews.responder            # dry-run, только показать
    python -m ozon_reviews.responder --send     # реально отправить ответы
"""

import argparse
import os
import time

import httpx
from dotenv import load_dotenv

BASE_URL = "https://api-seller.ozon.ru"

REPLIES = {
    "positive": (
        "Здравствуйте, {name}! Спасибо за тёплый отзыв и высокую оценку! "
        "Рады, что товар вам понравился. Будем рады видеть вас снова "
        "в магазине «4 сыночка»!"
    ),
    "neutral": (
        "Здравствуйте, {name}! Спасибо, что поделились мнением. Нам важно "
        "знать, что можно улучшить. Если есть пожелания или вопросы по "
        "товару, напишите нам — обязательно поможем."
    ),
    "negative": (
        "Здравствуйте, {name}! Нам очень жаль, что товар не оправдал "
        "ожиданий. Пожалуйста, напишите нам в чат заказа — мы разберёмся "
        "в ситуации и постараемся всё исправить."
    ),
}


TONE_PROMPT = (
    "Ты отвечаешь от имени магазина детских товаров «4 сыночка» на отзыв "
    "покупателя на Ozon. Тон: доброжелательный, сочувствующий, "
    "сопереживающий, радостный и понимающий. Пиши по-русски, 2-4 коротких "
    "предложения, тёпло и искренне, как живой человек. Отреагируй на "
    "конкретное содержание отзыва. Если покупатель недоволен - искренне "
    "посочувствуй, пойми его чувства и предложи написать нам в чат заказа, "
    "мы постараемся помочь. Если доволен - порадуйся вместе с ним и "
    "поблагодари. Не обещай возврат денег или компенсацию, не давай ссылок "
    "и контактов, не используй шаблонные канцеляризмы. Не выдумывай "
    "детали, которых нет в отзыве. В конце не подписывайся. Верни только "
    "текст ответа."
)
LLM_MODEL = "claude-haiku-4-5-20251001"


def generate_reply(rating: int, text: str, api_key: str | None) -> str:
    """Персональный ответ через Claude API; при любой ошибке - шаблон."""
    if not api_key:
        return pick_reply(rating)
    try:
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            json={
                "model": LLM_MODEL,
                "max_tokens": 300,
                "system": TONE_PROMPT,
                "messages": [
                    {
                        "role": "user",
                        "content": f"Оценка: {rating} из 5.\n"
                        f"Отзыв: {text or '(без текста, только оценка)'}",
                    }
                ],
            },
            timeout=60,
        )
        response.raise_for_status()
        reply = response.json()["content"][0]["text"].strip()
        return reply or pick_reply(rating)
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return pick_reply(rating)


def pick_reply(rating: int, name: str = "") -> str:
    if rating >= 4:
        key = "positive"
    elif rating == 3:
        key = "neutral"
    else:
        key = "negative"
    return (
        REPLIES[key]
        .format(name=name or "покупатель")
        .replace("Здравствуйте, !", "Здравствуйте!")
    )


class OzonReviewsClient:
    def __init__(self, client_id: str, api_key: str, timeout: float = 30.0):
        self._http = httpx.Client(
            base_url=BASE_URL,
            headers={"Client-Id": client_id, "Api-Key": api_key},
            timeout=timeout,
        )

    def _post(self, path: str, payload: dict) -> dict:
        response = self._http.post(path, json=payload)
        if response.is_error:
            raise SystemExit(f"Ozon {path}: {response.status_code} {response.text}")
        return response.json()

    def list_unprocessed(self, limit: int = 100):
        """Итерирует по необработанным отзывам с пагинацией."""
        last_id = ""
        while True:
            data = self._post(
                "/v1/review/list",
                {
                    "limit": limit,
                    "last_id": last_id,
                    "sort_dir": "DESC",
                    "status": "UNPROCESSED",
                },
            )
            yield from data.get("reviews", [])
            if not data.get("has_next"):
                return
            last_id = data.get("last_id", "")

    def reply(self, review_id: str, text: str) -> dict:
        """Публикует комментарий продавца и помечает отзыв обработанным."""
        return self._post(
            "/v1/review/comment/create",
            {
                "review_id": review_id,
                "text": text,
                "mark_review_as_processed": True,
            },
        )


def run(
    client: OzonReviewsClient,
    send: bool = False,
    pause: float = 0.5,
    llm_key: str | None = None,
) -> int:
    handled = 0
    for review in client.list_unprocessed():
        review_id = review["id"]
        rating = int(review.get("rating", 5))
        text = generate_reply(rating, review.get("text", ""), llm_key)
        print(f"[{review_id}] {rating}★ {review.get('text', '')[:80]!r}")
        print(f"    -> {text}")
        if send:
            client.reply(review_id, text)
            time.sleep(pause)
        handled += 1
    print(f"{'Отправлено' if send else 'Dry-run, обработано бы'}: {handled}")
    return handled


def env(name: str) -> str | None:
    """Значение переменной без пробелов и невидимых символов из копипаста."""
    value = "".join(ch for ch in os.environ.get(name, "") if ch.isprintable())
    return value.strip() or None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send", action="store_true", help="реально отправить")
    args = parser.parse_args()

    load_dotenv()
    client_id = env("OZON_CLIENT_ID")
    api_key = env("OZON_API_KEY")
    if not client_id or not api_key:
        raise SystemExit("Задайте OZON_CLIENT_ID и OZON_API_KEY в .env")
    run(
        OzonReviewsClient(client_id, api_key),
        send=args.send,
        llm_key=env("ANTHROPIC_API_KEY"),
    )


if __name__ == "__main__":
    main()
