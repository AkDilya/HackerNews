import asyncio
from database import trend_events

async def check_detailed():
    # Сколько статей имеют ПУСТОЙ массив технологий
    empty_tech = await trend_events.count_documents({
        "$or": [
            {"technologies": []},
            {"technologies": None},
            {"technologies": {"$exists": False}}
        ]
    })
    print(f"❌ Статей БЕЗ технологий: {empty_tech}")
    
    # Сколько статей имеют ХОТЯ БЫ ОДНУ технологию
    with_tech = await trend_events.count_documents({
        "technologies": {"$exists": True, "$ne": [], "$ne": None}
    })
    print(f"✅ Статей С технологиями: {with_tech}")
    
    # Примеры статей С технологиями
    print("\n📝 Статьи С технологиями:")
    sample = await trend_events.find(
        {"technologies": {"$exists": True, "$ne": [], "$ne": None}},
        {"title": 1, "technologies": 1, "_id": 0}
    ).limit(10).to_list(length=10)
    
    for s in sample:
        print(f"   '{s['title']}' -> {s['technologies']}")

if __name__ == "__main__":
    asyncio.run(check_detailed())