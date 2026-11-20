import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

# Windows-консоли с кодировкой cp1251 падают на эмодзи в print() — принудительно UTF-8
if hasattr(sys.stdout, "reconfigure") and (sys.stdout.encoding or "").lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import init_db, client
from routers.trends import router as trends_router
from routers.auth import router as auth_router  # Импортируем роутер
from routers.graph import router as graph_router
from routers.favorites import router as favorites_router
from routers.subscriptions import router as subscriptions_router
from routers.feed import router as feed_router
from routers.admin import router as admin_router
from routers.admin import public_router as admin_public_router

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await init_db()
    yield


app = FastAPI(title="TrendRadar API", lifespan=lifespan)

@app.get("/api/health", tags=["monitoring"])
async def health():
    """Health Check: доступность API и MongoDB (для мониторинга и CI/CD)."""
    try:
        await client.admin.command("ping")
        return {"status": "ok", "database": "ok"}
    except Exception as exc:
        print(f"❌ Health check failed: {exc}")
        return JSONResponse(status_code=503, content={"status": "error", "database": "unavailable"})

# ВАЖНО: Для работы httpOnly cookies нужно разрешить credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,  # Обязательно True для передачи cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(trends_router)
app.include_router(auth_router)
app.include_router(graph_router)
app.include_router(favorites_router)
app.include_router(subscriptions_router)
app.include_router(feed_router)
app.include_router(admin_router)
app.include_router(admin_public_router)