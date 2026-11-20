import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

import httpx

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from database import save_trend_events, trend_events  # noqa: E402
from ai_agent import extract_technologies  # noqa: E402

HN_API_URL: str = os.getenv("HN_API_URL", "https://hacker-news.firebaseio.com/v0")
REQUEST_TIMEOUT: float = 15.0
MAX_RETRIES: int = 3
RETRY_DELAY_SECONDS: float = 2.0


async def _fetch_json(client: httpx.AsyncClient, url: str) -> Any | None:
    """Загружает JSON с повторными попытками при ошибках"""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = await client.get(url, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            if attempt == MAX_RETRIES:
                print(f"❌ Failed to fetch {url} after {MAX_RETRIES} attempts: {exc}")
                return None
            await asyncio.sleep(RETRY_DELAY_SECONDS)
    return None


async def _fetch_item(client: httpx.AsyncClient, item_id: int) -> dict[str, Any] | None:
    """Загружает одну статью с HN по ID"""
    item = await _fetch_json(client, f"{HN_API_URL}/item/{item_id}.json")
    if item is None or item.get("type") != "story":
        return None

    item_id_value = item.get("id")
    return {
        "id": item_id_value,
        "title": item.get("title", ""),
        "score": item.get("score", 0),
        "descendants": item.get("descendants", 0),
        "time": item.get("time"),
        "url": item.get("url", f"https://news.ycombinator.com/item?id={item_id_value}"),
        "source": "hackernews",
    }


async def fetch_top_stories(limit: int = 30) -> list[dict[str, Any]]:
    """Загружает топ-N историй с Hacker News параллельно"""
    async with httpx.AsyncClient() as client:
        story_ids = await _fetch_json(client, f"{HN_API_URL}/topstories.json")
        if not story_ids:
            return []

        tasks = [_fetch_item(client, item_id) for item_id in story_ids[:limit]]
        results = await asyncio.gather(*tasks)

    return [story for story in results if story is not None]


async def _get_existing_ids() -> set[int]:
    """Получает множество ID уже обработанных статей из БД"""
    try:
        cursor = trend_events.find({}, {"id": 1, "_id": 0})
        docs = await cursor.to_list(length=None)
        return {doc["id"] for doc in docs if "id" in doc}
    except Exception as e:
        print(f"️  Ошибка получения существующих ID: {e}")
        return set()


async def process_stories(stories: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Обрабатывает статьи через AI-агент с фильтрацией и прогрессом.
    Возвращает только статьи, у которых есть хотя бы одна технология.
    """
    processed: list[dict[str, Any]] = []
    total = len(stories)
    
    print(f"\n🤖 Начинаю AI-анализ {total} статей...")
    
    # Ограничиваем количество одновременных запросов к LLM
    semaphore = asyncio.Semaphore(5)
    
    async def process_with_semaphore(story: dict[str, Any], idx: int) -> dict[str, Any] | None:
        async with semaphore:
            try:
                analysis = extract_technologies(story["title"])
                
                # ФИЛЬТР: пропускаем статьи без технологий
                if not analysis.get("technologies"):
                    return None
                
                result = {**story, **analysis}
                
                # Прогресс каждые 10 статей
                if (idx + 1) % 10 == 0 or idx == total - 1:
                    print(f"   Обработано: {idx + 1}/{total} ({(idx + 1) / total * 100:.0f}%)")
                
                return result
            except Exception as e:
                print(f"️  Ошибка обработки статьи {story.get('id')}: {e}")
                return None
    
    tasks = [process_with_semaphore(story, idx) for idx, story in enumerate(stories)]
    results = await asyncio.gather(*tasks)
    
    # Фильтруем None (статьи без технологий или с ошибками)
    processed = [r for r in results if r is not None]
    
    print(f"✅ AI-анализ завершён: {len(processed)} из {total} статей содержат технологии\n")
    return processed


async def collect_once(limit: int = 50) -> int:
    """
    Главная функция сбора: загружает статьи, фильтрует дубликаты,
    анализирует через AI и сохраняет в БД.
    """
    print(f"\n{'='*60}")
    print(f"📡 Начинаю сбор данных (лимит: {limit})")
    print(f"{'='*60}")
    
    # 1. Получаем существующие ID, чтобы не анализировать повторно
    existing_ids = await _get_existing_ids()
    print(f" Уже в базе: {len(existing_ids)} статей")
    
    # 2. Загружаем топ историй с HN
    print(f"⬇️  Загружаю топ-{limit} историй с Hacker News...")
    stories = await fetch_top_stories(limit=limit)
    print(f"   Загружено: {len(stories)} историй")
    
    # 3. Фильтруем дубликаты
    new_stories = [s for s in stories if s["id"] not in existing_ids]
    print(f"   Новых статей: {len(new_stories)}")
    
    if not new_stories:
        print("️  Нет новых статей для обработки")
        return 0
    
    # 4. AI-анализ (с фильтрацией статей без технологий)
    processed_stories = await process_stories(new_stories)
    
    if not processed_stories:
        print("⚠️  AI не нашёл технологий ни в одной статье")
        return 0
    
    # 5. Добавляем timestamps
    for story in processed_stories:
        timestamp = story.get("time")
        story["created_at"] = (
            datetime.fromtimestamp(timestamp, tz=timezone.utc)
            if timestamp
            else datetime.now(timezone.utc)
        )
    
    # 6. Сохраняем в БД
    print(f" Сохраняю в базу данных...")
    saved_count = await save_trend_events(processed_stories)
    print(f"✅ Сохранено: {saved_count} новых записей")
    print(f"{'='*60}\n")
    
    return saved_count


async def _main() -> None:
    """Ручной тест: обработка 10 статей и вывод результата"""
    stories = await fetch_top_stories(limit=10)
    processed_stories = await process_stories(stories)
    print(json.dumps(processed_stories, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(_main())