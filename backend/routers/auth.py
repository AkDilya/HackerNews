import os
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import RedirectResponse
from jose import jwt, JWTError

from database import users

router = APIRouter(prefix="/api/auth", tags=["auth"])

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


def create_jwt_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=30)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_token_from_header(authorization: Optional[str] = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth scheme")
    return authorization.split(" ", 1)[1]


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        github_id = payload.get("sub")
        if github_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/github")
async def github_login():
    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={BACKEND_URL}/api/auth/github/callback"
        f"&scope=read:user"
    )
    return RedirectResponse(url=github_auth_url)


@router.get("/github/callback")
async def github_callback(code: str):
    if not code:
        raise HTTPException(status_code=400, detail="Code not provided")

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": f"{BACKEND_URL}/api/auth/github/callback",
            },
        )
        token_data = token_response.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get access token")

        user_response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        github_user = user_response.json()

    user_doc = {
        "github_id": str(github_user["id"]),
        "username": github_user.get("login", "Unknown"),
        "avatar_url": github_user.get("avatar_url", ""),
        "email": github_user.get("email", ""),
        "weekly_digest": False,
    }

    await users.update_one(
        {"github_id": user_doc["github_id"]},
        {"$set": user_doc},
        upsert=True,
    )

    token = create_jwt_token({"sub": str(github_user["id"]), "username": github_user["login"]})

    # Возвращаем токен в URL как параметр (фронтенд сохранит его в localStorage)
    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={token}")


@router.get("/me")
async def get_me(authorization: Optional[str] = Header(None)):
    token = get_token_from_header(authorization)
    payload = decode_token(token)
    github_id = payload.get("sub")

    user = await users.find_one({"github_id": github_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user["_id"] = str(user["_id"])
    return user


@router.post("/logout")
async def logout():
    return {"message": "Logged out"}