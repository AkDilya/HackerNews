from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from database import favorites_collection
from routers.auth import get_token_from_header, decode_token

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


class FavoriteRequest(BaseModel):
    article_id: int
    title: str
    url: str | None = None
    score: int = 0
    technologies: list[str] = []


def _get_user_key(authorization: Optional[str]) -> str:
    """Достаёт github_id из JWT — каждое избранное принадлежит конкретному пользователю."""
    token = get_token_from_header(authorization)
    payload = decode_token(token)
    return payload["sub"]


def _serialize(favorite: dict[str, Any]) -> dict[str, Any]:
    favorite["_id"] = str(favorite["_id"])
    if "added_at" in favorite and favorite["added_at"] is not None:
        favorite["added_at"] = favorite["added_at"].isoformat()
    return favorite


@router.get("")
async def get_favorites(authorization: Optional[str] = Header(None)) -> list[dict[str, Any]]:
    """Получить избранные статьи текущего пользователя."""
    user_key = _get_user_key(authorization)
    cursor = favorites_collection.find({"user_key": user_key}).sort("added_at", -1)
    favorites = await cursor.to_list(length=None)
    return [_serialize(fav) for fav in favorites]


@router.post("")
async def add_favorite(req: FavoriteRequest, authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    """Добавить статью в избранное текущего пользователя."""
    user_key = _get_user_key(authorization)

    existing = await favorites_collection.find_one(
        {"user_key": user_key, "article_id": req.article_id}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already in favorites")

    favorite = {
        "user_key": user_key,
        "article_id": req.article_id,
        "title": req.title,
        "url": req.url,
        "score": req.score,
        "technologies": req.technologies,
        "added_at": datetime.now(timezone.utc),
    }

    # Уникальность (user_key, article_id): один и тот же пользователь не может добавить статью дважды
    try:
        await favorites_collection.insert_one(favorite)
    except Exception:
        raise HTTPException(status_code=400, detail="Already in favorites")

    return _serialize(favorite)


@router.delete("/{article_id}")
async def remove_favorite(article_id: int, authorization: Optional[str] = Header(None)) -> dict[str, str]:
    """Удалить статью из избранного текущего пользователя."""
    user_key = _get_user_key(authorization)
    result = await favorites_collection.delete_one({"user_key": user_key, "article_id": article_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "deleted"}


@router.get("/check/{article_id}")
async def check_favorite(article_id: int, authorization: Optional[str] = Header(None)) -> dict[str, bool]:
    """Проверить, есть ли статья в избранном текущего пользователя. Без токена — просто False."""
    if not authorization:
        return {"is_favorite": False}

    try:
        user_key = _get_user_key(authorization)
    except HTTPException:
        return {"is_favorite": False}

    exists = await favorites_collection.find_one(
        {"user_key": user_key, "article_id": article_id}
    )
    return {"is_favorite": exists is not None}
