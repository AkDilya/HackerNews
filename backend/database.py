import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME: str = os.getenv("DATABASE_NAME", "trendradar")

client: AsyncIOMotorClient = AsyncIOMotorClient(MONGODB_URL)
db = client[DATABASE_NAME]

# Коллекция трендов (статьи с технологиями)
trend_events = db["trend_events"]

# Коллекция избранного
favorites_collection = db["favorites"]

# Коллекция подписок пользователя на технологии
subscriptions_collection = db["subscriptions"]

# Коллекция пользователей (для авторизации через GitHub)
users = db["users"]


async def save_trend_events(documents: list[dict]) -> int:
    """Сохраняет документы в коллекцию trend_events с проверкой дубликатов"""
    if not documents:
        return 0
    
    # Фильтруем дубликаты по полю id
    existing_ids = set()
    async for doc in trend_events.find({}, {"id": 1}):
        existing_ids.add(doc["id"])
    
    new_docs = [doc for doc in documents if doc.get("id") not in existing_ids]
    
    if new_docs:
        result = await trend_events.insert_many(new_docs)
        return len(result.inserted_ids)
    return 0


async def init_db():
    """Инициализация БД: создание индексов"""
    print("✅ База данных и индексы инициализированы")
    
    # Индексы для trend_events
    await trend_events.create_index("id", unique=True)
    await trend_events.create_index("created_at")
    await trend_events.create_index("technologies")
    await trend_events.create_index("sentiment")
    await trend_events.create_index("category")
    
    # Индексы для favorites (избранное теперь принадлежит конкретному пользователю)
    try:
        # Старый глобально-уникальный индекс article_id мешает нескольким пользователям
        await favorites_collection.drop_index("article_id_1")
        print("🗑️  Удалён старый уникальный индекс favorites.article_id")
    except Exception:
        pass  # индекса нет — это нормально

    await favorites_collection.create_index("user_key")
    await favorites_collection.create_index(
        [("user_key", 1), ("article_id", 1)], unique=True
    )
    await favorites_collection.create_index("added_at")
    
    # Индексы для users
    await users.create_index("github_id", unique=True)
    await users.create_index("username")

    # Индексы для подписок на технологии (по одной подписке (user_key, technology))
    await subscriptions_collection.create_index(
        [("user_key", 1), ("technology", 1)], unique=True
    )
    await subscriptions_collection.create_index("user_key")