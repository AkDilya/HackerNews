"""Сборщик статей с Dev.to — второй источник данных TrendRadar.

API: https://dev.to/api/articles?top=N&per_page=M (топ-статьи за N дней).
Маппинг на схему trend_events:
  id <- id (int), title <- title, url <- url,
  score <- positive_reactions_count, descendants <- comments_count,
  created_at <- published_timestamp, source <- "devto".
Технологии/тональность извлекает тот же AI-агент, что и для HN.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from typing import Any

import httpx

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from database import save_trend_events, trend_events  # noqa: E402
from ai_agent import extract_technologies  # noqa: E402
from hn_collector import process_stories  # noqa: E402  (общая AI-обработка)

DEVTO_API_URL: str = os.getenv("DEVTO_API_URL", "https://dev.to/api/articles")
DEVTO_DAYS: int = int(os.getenv("DEVTO_DAYS", "7"))
DEVTO_PER_PAGE: int = int(os.getenv("DEVTO_PER_PAGE", "50"))
REQUEST_TIMEOUT: float = 15.0
MAX_RETRIES: int = 3
RETRY_DELAY_SECONDS: float = 2.0


async def fetch_devto_articles(limit: int = 50) -> list[dict[str, Any]]:
    """Загружает топ-N статей с Dev.to за последние DEVTO_DAYS дней."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    DEVTO_API_URL,
                    params={"top": DEVTO_DAYS, "per_page": min(limit, DEVTO_PER_PAGE)},
                    timeout=REQUEST_TIMEOUT,
                )
                response.raise_for_status()
                raw_articles = response.json()
                break
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            if attempt == MAX_RETRIES:
                print(f"❌ Failed to fetch Dev.to articles after {MAX_RETRIES} attempts: {exc}")
                return []
            await asyncio.sleep(RETRY_DELAY_SECONDS)
    else:
        return []

    articles: list[dict[str, Any]] = []
    for raw in raw_articles[:limit]:
        article_id = raw.get("id")
        if article_id is None:
            continue
        articles.append(
            {
                "id": article_id,
                "title": raw.get("title", ""),
                "score": raw.get("positive_reactions_count", 0) or 0,
                "descendants": raw.get("comments_count", 0) or 0,
                "url": raw.get("url") or raw.get("path", ""),
                "published": raw.get("published_timestamp"),
                "source": "devto",
            }
        )
    return articles


async def _get_existing_ids() -> set[int]:
    try:
        cursor = trend_events.find({}, {"id": 1, "_id": 0})
        docs = await cursor.to_list(length=None)
        return {doc["id"] for doc in docs if "id" in doc}
    except Exception as e:
        print(f"️  Ошибка получения существующих ID: {e}")
        return set()


def _parse_published(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


async def collect_devto_once(limit: int = 50) -> int:
    """Сбор с Dev.to: загрузка, фильтр дубликатов, AI-анализ, сохранение."""
    print(f"\n{'='*60}")
    print(f"📡 Начинаю сбор с Dev.to (лимит: {limit}, топ за {DEVTO_DAYS} дн.)")
    print(f"{'='*60}")

    existing_ids = await _get_existing_ids()
    print(f" Уже в базе: {len(existing_ids)} статей")

    articles = await fetch_devto_articles(limit=limit)
    print(f"   Загружено: {len(articles)} статей")

    new_articles = [a for a in articles if a["id"] not in existing_ids]
    print(f"   Новых статей: {len(new_articles)}")

    if not new_articles:
        print("️  Нет новых статей с Dev.to для обработки")
        return 0

    processed = await process_stories(new_articles)
    if not processed:
        print("⚠️  AI не нашёл технологий ни в одной статье Dev.to")
        return 0

    for article in processed:
        parsed = _parse_published(article.get("published"))
        article["created_at"] = parsed or datetime.now(timezone.utc)
        article.pop("published", None)

    print(f" Сохраняю в базу данных...")
    saved_count = await save_trend_events(processed)
    print(f"✅ Сохранено с Dev.to: {saved_count} новых записей")
    print(f"{'='*60}\n")

    return saved_count


async def _main() -> None:
    """Ручной тест: сбор 10 статей с Dev.to."""
    saved = await collect_devto_once(limit=10)
    print(f"Saved: {saved}")


if __name__ == "__main__":
    asyncio.run(_main())
