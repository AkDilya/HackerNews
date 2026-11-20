import os
import re
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from database import trend_events

router = APIRouter(prefix="/api/trends", tags=["trends"])

OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")
OLLAMA_TIMEOUT: float = 30.0

ARTICLE_PROJECTION = {
    "id": 1,
    "title": 1,
    "url": 1,
    "score": 1,
    "descendants": 1,
    "created_at": 1,
    "technologies": 1,
    "category": 1,
    "_id": 0,
}

# Допустимые варианты сортировки: sort_by -> поле MongoDB
SORT_FIELDS: dict[str, str] = {
    "date": "created_at",
    "score": "score",
    "comments": "descendants",
}


async def _serialize_articles(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Конвертирует datetime в строки для JSON."""
    for article in articles:
        if "created_at" in article and article["created_at"] is not None:
            article["created_at"] = article["created_at"].isoformat()
    return articles


@router.get("/summary")
async def get_trend_summary() -> dict[str, Any]:
    """Получает общую статистику трендов"""
    total_count = await trend_events.count_documents({})

    # Топ технология
    top_tech_pipeline = [
        {"$unwind": "$technologies"},
        {"$group": {"_id": "$technologies", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]
    top_tech_result = await trend_events.aggregate(top_tech_pipeline).to_list(length=1)
    top_tech = top_tech_result[0]["_id"] if top_tech_result else None
    top_tech_count = top_tech_result[0]["count"] if top_tech_result else 0

    # Тональность
    sentiment_pipeline = [
        {"$group": {"_id": "$sentiment", "count": {"$sum": 1}}},
    ]
    sentiment_result = await trend_events.aggregate(sentiment_pipeline).to_list(length=None)

    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    for item in sentiment_result:
        if item["_id"] in sentiment_counts:
            sentiment_counts[item["_id"]] = item["count"]

    total_sentiment = sum(sentiment_counts.values())
    sentiment_percentages = {
        "positive": round(sentiment_counts["positive"] / total_sentiment * 100, 1) if total_sentiment > 0 else 0,
        "neutral": round(sentiment_counts["neutral"] / total_sentiment * 100, 1) if total_sentiment > 0 else 0,
        "negative": round(sentiment_counts["negative"] / total_sentiment * 100, 1) if total_sentiment > 0 else 0,
    }

    return {
        "total_count": total_count,
        "top_tech": top_tech,
        "top_tech_count": top_tech_count,
        "sentiment": sentiment_percentages,
    }


@router.get("/search")
async def search_articles(
    q: str = "",
    technology: str = "",
    sort_by: str = "date",
    limit: int = 50,
    skip: int = 0,
) -> dict[str, Any]:
    """Поиск статей с сортировкой: date (новые), score (рейтинг), comments (комментарии).
    Возвращает страницу и общее число найденного: {"items": [...], "total": N} —
    этого достаточно для пагинации на фронте."""
    query: dict[str, Any] = {}
    if q.strip():
        query["title"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    if technology:
        query["technologies"] = technology

    sort_field = SORT_FIELDS.get(sort_by, "created_at")
    limit = max(1, min(limit, 200))
    skip = max(0, skip)

    total = await trend_events.count_documents(query)
    cursor = trend_events.find(query, ARTICLE_PROJECTION).sort(sort_field, -1).skip(skip).limit(limit)
    articles = await cursor.to_list(length=limit)
    return {"items": await _serialize_articles(articles), "total": total}


@router.get("/compare")
async def compare_technologies(tech: str, days: int = 14) -> dict[str, Any]:
    """Сравнение 2–4 технологий: упоминания по дням на одном графике.
    Пример: /api/trends/compare?tech=Python,Rust&days=14
    Возвращает {"techs": [...], "data": [{"date": "2026-11-01", "Python": 3, "Rust": 1}, ...]}"""
    techs = [t.strip() for t in tech.split(",") if t.strip()][:4]
    if not techs:
        return {"techs": [], "data": []}

    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=max(1, min(days, 90)))
    start = start.replace(hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"technologies": {"$in": techs}, "created_at": {"$gte": start}}},
        {"$unwind": "$technologies"},
        {"$match": {"technologies": {"$in": techs}}},
        {
            "$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "tech": "$technologies",
                },
                "count": {"$sum": 1},
            }
        },
    ]
    result = await trend_events.aggregate(pipeline).to_list(length=None)

    # Разложим по датам и заполним нулями, чтобы линии были непрерывными
    counts: dict[str, dict[str, int]] = {}
    for item in result:
        date, tech_name = item["_id"]["date"], item["_id"]["tech"]
        counts.setdefault(date, {})[tech_name] = item["count"]

    data: list[dict[str, Any]] = []
    current = start
    while current <= now:
        date_key = current.strftime("%Y-%m-%d")
        row: dict[str, Any] = {"date": date_key}
        for tech_name in techs:
            row[tech_name] = counts.get(date_key, {}).get(tech_name, 0)
        data.append(row)
        current += timedelta(days=1)

    return {"techs": techs, "data": data}


@router.get("/hidden-gems")
async def get_hidden_gems() -> list[dict[str, Any]]:
    """«Скрытые жемчужины»: высокий рейтинг (score > 100) при малом числе комментариев (< 5)."""
    query = {
        "score": {"$gt": 100},
        "descendants": {"$lt": 5},
    }

    cursor = trend_events.find(query, ARTICLE_PROJECTION).sort("score", -1).limit(3)
    articles = await cursor.to_list(length=3)
    return await _serialize_articles(articles)


@router.get("/similar/{tech_name}")
async def get_similar_technologies(tech_name: str, limit: int = 3) -> list[dict[str, Any]]:
    """Возвращает технологии, которые чаще всего упоминаются вместе с указанной."""
    pipeline = [
        {"$match": {"technologies": tech_name}},
        {"$unwind": "$technologies"},
        {"$match": {"technologies": {"$nin": [tech_name, "", None]}}},
        {"$group": {"_id": "$technologies", "count": {"$sum": 1}}},
        {"$sort": {"count": -1, "_id": 1}},
        {"$limit": max(1, min(limit, 20))},
    ]

    result = await trend_events.aggregate(pipeline).to_list(length=max(1, min(limit, 20)))
    return [{"name": item["_id"], "count": item["count"]} for item in result]


class SummarizeRequest(BaseModel):
    title: str
    url: str | None = None


@router.post("/summarize")
async def summarize_article(req: SummarizeRequest) -> dict[str, str]:
    """Генерирует краткое саммари статьи через локальную Ollama."""
    fallback = {"summary": "AI is temporarily unavailable"}

    title = (req.title or "").strip()
    if not title:
        return fallback

    prompt = (
        "You are an IT analyst. Write a brief summary (4-5 sentences) "
        f"of this article in English. Title: {title}. "
        "If impossible, write 'No description'."
    )

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.4},
    }

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
            response = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
        print(f"⚠️  Ollama недоступна: {exc}")
        return fallback

    summary = (data.get("response") or "").strip()
    return {"summary": summary} if summary else fallback


@router.get("/{technology}/articles")
async def get_articles_by_technology(
    technology: str,
    sort_by: str = "date",
    limit: int = 10,
    skip: int = 0,
) -> list[dict[str, Any]]:
    """Получает статьи по конкретной технологии"""
    sort_field = SORT_FIELDS.get(sort_by, "created_at")

    cursor = trend_events.find(
        {"technologies": technology},
        {
            "id": 1,
            "title": 1,
            "url": 1,
            "score": 1,
            "descendants": 1,
            "created_at": 1,
            "technologies": 1,
            "category": 1,
            "_id": 0,
        },
    ).sort(sort_field, -1).skip(skip).limit(limit)

    articles = await cursor.to_list(length=limit)
    return await _serialize_articles(articles)


@router.get("/{technology}/timeline")
async def get_technology_timeline(technology: str) -> list[dict[str, Any]]:
    """Получает временную шкалу упоминаний технологии"""
    pipeline = [
        {"$match": {"technologies": technology}},
        {
            "$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    result = await trend_events.aggregate(pipeline).to_list(length=None)
    return [{"date": item["_id"], "count": item["count"]} for item in result]
