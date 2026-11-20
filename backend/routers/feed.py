from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header

from database import favorites_collection, subscriptions_collection, trend_events

router = APIRouter(prefix="/api/feed", tags=["feed"])

# Сколько последних статей участвует в ранжировании
FEED_POOL_SIZE: int = 300
# Сколько дней назад искать статьи
FEED_WINDOW_DAYS: int = 30

# Веса ранжирования (прозрачная формула)
WEIGHT_SUB_TECH: float = 30.0    # технология из подписок
WEIGHT_NEW_FOR_SUB: float = 20.0 # появилась после последнего визита подписки
WEIGHT_FAV_TECH: float = 10.0    # технология встречается в избранном пользователя
WEIGHT_RECENCY_MAX: float = 20.0 # свежесть: 20 → 0 за 20 дней
WEIGHT_SCORE: float = 0.01       # вклад HN-рейтинга


def _rank_article(
    article: dict[str, Any],
    sub_techs: set[str],
    last_seen: dict[str, Optional[datetime]],
    fav_techs: set[str],
    now: datetime,
) -> dict[str, Any]:
    technologies = article.get("technologies") or []
    matched = [t for t in technologies if t in sub_techs]

    feed_score = float(article.get("score") or 0) * WEIGHT_SCORE
    for tech in matched:
        feed_score += WEIGHT_SUB_TECH
        seen_at = last_seen.get(tech)
        created = article.get("created_at")
        if seen_at and created and created > seen_at:
            feed_score += WEIGHT_NEW_FOR_SUB
    for tech in technologies:
        if tech in fav_techs:
            feed_score += WEIGHT_FAV_TECH

    created = article.get("created_at")
    if created:
        days_old = max(0, (now - created).days)
        feed_score += max(0.0, WEIGHT_RECENCY_MAX - days_old)

    return {**article, "feed_score": round(feed_score, 1), "matched_techs": matched}


@router.get("")
async def get_feed(
    limit: int = 15,
    authorization: Optional[str] = Header(None),
) -> dict[str, Any]:
    """Умная лента: персональный ранжированный фид по подпискам и избранному.
    Без токена возвращает пустой фид — фронтенд покажет подсказку войти."""
    if not authorization:
        return {"personalized": False, "items": []}

    from routers.auth import get_token_from_header, decode_token
    from fastapi import HTTPException

    try:
        token = get_token_from_header(authorization)
        user_key = decode_token(token)["sub"]
    except HTTPException:
        return {"personalized": False, "items": []}

    subscriptions = await subscriptions_collection.find({"user_key": user_key}).to_list(length=None)
    sub_techs = {s["technology"] for s in subscriptions}
    last_seen = {s["technology"]: s.get("last_seen_at") for s in subscriptions}

    favorites = await favorites_collection.find({"user_key": user_key}).to_list(length=None)
    fav_techs = {tech for fav in favorites for tech in (fav.get("technologies") or [])}

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    since = now - timedelta(days=FEED_WINDOW_DAYS)

    cursor = trend_events.find({}, {"_id": 0}).sort("created_at", -1).limit(FEED_POOL_SIZE)
    articles = await cursor.to_list(length=FEED_POOL_SIZE)
    # Оставляем только свежее окно (created_at может отсутствовать — такие отбрасываем)
    articles = [a for a in articles if a.get("created_at") and a["created_at"] >= since]

    ranked = [
        _rank_article(article, sub_techs, last_seen, fav_techs, now)
        for article in articles
    ]
    ranked.sort(key=lambda a: (a["feed_score"], a.get("score") or 0), reverse=True)

    items = ranked[: max(1, min(limit, 50))]
    for item in items:
        if item.get("created_at") is not None:
            item["created_at"] = item["created_at"].isoformat()

    return {"personalized": True, "items": items}
