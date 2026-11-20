import os
import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException

from database import trend_events

# Закрытый роутер: /api/admin/* — статистика и обслуживающие действия по ключу
router = APIRouter(prefix="/api/admin", tags=["admin"])

# Публичный роутер: /api/stats — те же счётчики для страницы About (без ключа)
public_router = APIRouter(prefix="/api/stats", tags=["admin"])

# Ключ для доступа к админ-панели; задаётся через переменную окружения ADMIN_KEY.
# Если ключ не задан, админ-эндпоинты отключены (503), а не открыты дефолтным паролем.
ADMIN_KEY: str = os.getenv("ADMIN_KEY") or ""


def _check_admin_key(x_admin_key: str | None) -> None:
    """Проверяет X-Admin-Key. Без настроенного ADMIN_KEY доступ закрыт полностью."""
    if not ADMIN_KEY:
        raise HTTPException(status_code=503, detail="ADMIN_KEY is not configured")
    if not x_admin_key or not secrets.compare_digest(x_admin_key, ADMIN_KEY):
        raise HTTPException(status_code=403, detail="Invalid admin key")


async def _collect_stats() -> dict[str, Any]:
    """Собирает статистику коллекционера: статьи, технологии, последний сбор, источники."""
    total_stories = await trend_events.count_documents({})

    # Уникальные технологии
    tech_pipeline = [
        {"$unwind": "$technologies"},
        {"$group": {"_id": "$technologies"}},
        {"$count": "total"},
    ]
    tech_result = await trend_events.aggregate(tech_pipeline).to_list(length=1)
    total_technologies = tech_result[0]["total"] if tech_result else 0

    # Дата последней собранной статьи
    last_doc = await trend_events.find_one(
        {},
        {"created_at": 1, "_id": 0},
        sort=[("created_at", -1)],
    )
    last_doc = last_doc or {}
    last_created = last_doc.get("created_at")
    last_collection_time = last_created.isoformat() if last_created else None

    # Источники: поле source, у старых записей — по домену url (dev.to отдельно)
    sources_pipeline = [
        {
            "$group": {
                "_id": {
                    "$cond": [
                        {"$in": [{"$ifNull": ["$source", None]}, ["devto", "hackernews"]]},
                        {"$ifNull": ["$source", "hackernews"]},
                        {
                            "$cond": [
                                {
                                    "$regexMatch": {
                                        "input": {"$ifNull": ["$url", ""]},
                                        "regex": "dev\\.to",
                                    }
                                },
                                "devto",
                                "hackernews",
                            ]
                        },
                    ]
                },
                "count": {"$sum": 1},
            }
        },
    ]
    sources_result = await trend_events.aggregate(sources_pipeline).to_list(length=None)
    sources = {"hackernews": 0, "devto": 0}
    for item in sources_result:
        if item["_id"] in sources:
            sources[item["_id"]] = item["count"]

    return {
        "total_stories": total_stories,
        "total_technologies": total_technologies,
        "last_collection_time": last_collection_time,
        "sources": sources,
    }


@public_router.get("")
async def get_public_stats() -> dict[str, Any]:
    """Публичная статистика для страницы About. Ключ не нужен: цифры не секретны,
    а обслуживающие действия защищены отдельно через /api/admin/*."""
    return await _collect_stats()


@router.get("/stats")
async def get_admin_stats(x_admin_key: str | None = Header(None)) -> dict[str, Any]:
    """Статистика для админ-панели. Требует заголовок X-Admin-Key."""
    _check_admin_key(x_admin_key)
    return await _collect_stats()


@router.post("/clear")
async def clear_database(x_admin_key: str | None = Header(None)) -> dict[str, Any]:
    """Очищает коллекцию trend_events. Требует заголовок X-Admin-Key."""
    _check_admin_key(x_admin_key)

    result = await trend_events.delete_many({})
    print(f"🗑️  База trend_events очищена, удалено записей: {result.deleted_count}")
    return {"status": "cleared", "deleted": result.deleted_count}
