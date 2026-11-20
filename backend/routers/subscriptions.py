from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from database import subscriptions_collection, trend_events
from routers.auth import get_token_from_header, decode_token

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


class SubscribeRequest(BaseModel):
    technology: str


def _get_user_key(authorization: Optional[str]) -> str:
    """github_id из JWT — подписки привязаны к конкретному пользователю."""
    token = get_token_from_header(authorization)
    payload = decode_token(token)
    return payload["sub"]


def _serialize(subscription: dict[str, Any]) -> dict[str, Any]:
    subscription["_id"] = str(subscription["_id"])
    if subscription.get("subscribed_at") is not None:
        subscription["subscribed_at"] = subscription["subscribed_at"].isoformat()
    if subscription.get("last_seen_at") is not None:
        subscription["last_seen_at"] = subscription["last_seen_at"].isoformat()
    return subscription


async def _count_new(technology: str, last_seen_at: Optional[datetime]) -> int:
    """Сколько новых статей по технологии появилось после последнего визита."""
    query: dict[str, Any] = {"technologies": technology}
    if last_seen_at is not None:
        query["created_at"] = {"$gt": last_seen_at}
    return await trend_events.count_documents(query)


async def _count_total(technology: str) -> int:
    return await trend_events.count_documents({"technologies": technology})


@router.get("")
async def list_subscriptions(authorization: Optional[str] = Header(None)) -> list[dict[str, Any]]:
    """Подписки текущего пользователя со счётчиком новых статей."""
    user_key = _get_user_key(authorization)

    cursor = subscriptions_collection.find({"user_key": user_key}).sort("subscribed_at", -1)
    subscriptions = await cursor.to_list(length=None)

    result = []
    for subscription in subscriptions:
        item = _serialize(subscription)
        item["new_count"] = await _count_new(subscription["technology"], subscription.get("last_seen_at"))
        item["total_count"] = await _count_total(subscription["technology"])
        result.append(item)
    return result


@router.post("")
async def subscribe(req: SubscribeRequest, authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    """Подписаться на технологию."""
    user_key = _get_user_key(authorization)

    technology = (req.technology or "").strip()
    if not technology:
        raise HTTPException(status_code=422, detail="Technology is required")

    existing = await subscriptions_collection.find_one(
        {"user_key": user_key, "technology": technology}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already subscribed")

    now = datetime.now(timezone.utc)
    subscription = {
        "user_key": user_key,
        "technology": technology,
        "subscribed_at": now,
        "last_seen_at": now,  # статьи после этого момента считаются новыми
    }
    await subscriptions_collection.insert_one(subscription)
    serialized = _serialize(subscription)
    serialized["new_count"] = 0
    serialized["total_count"] = await _count_total(technology)
    return serialized


@router.delete("/{technology}")
async def unsubscribe(technology: str, authorization: Optional[str] = Header(None)) -> dict[str, str]:
    """Отписаться от технологии."""
    user_key = _get_user_key(authorization)

    result = await subscriptions_collection.delete_one(
        {"user_key": user_key, "technology": technology}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not subscribed")
    return {"status": "unsubscribed"}


@router.post("/{technology}/visit")
async def mark_visited(technology: str, authorization: Optional[str] = Header(None)) -> dict[str, str]:
    """Отметить технологию как просмотренную: сбрасывает счётчик новых статей."""
    user_key = _get_user_key(authorization)

    result = await subscriptions_collection.update_one(
        {"user_key": user_key, "technology": technology},
        {"$set": {"last_seen_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not subscribed")
    return {"status": "marked"}
