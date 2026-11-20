import asyncio
from database import trend_events

async def check_data():
    # Общее количество документов
    total = await trend_events.count_documents({})
    print(f"📊 Всего статей в базе: {total}")
    
    # Сколько статей имеют технологии
    with_tech = await trend_events.count_documents({
        "technologies": {"$exists": True, "$ne": [], "$ne": None}
    })
    print(f"🔧 Статей с технологиями: {with_tech}")
    
    # Топ-10 технологий
    pipeline = [
        {"$unwind": "$technologies"},
        {"$match": {"technologies": {"$ne": None, "$ne": ""}}},
        {"$group": {"_id": "$technologies", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    
    results = await trend_events.aggregate(pipeline).to_list(length=10)
    print("\n🏆 Топ-10 технологий:")
    for r in results:
        print(f"   {r['_id']}: {r['count']} упоминаний")
    
    # Примеры статей с технологиями
    print("\n📝 Примеры статей с технологиями:")
    sample = await trend_events.find(
        {"technologies": {"$exists": True, "$ne": [], "$ne": None}},
        {"title": 1, "technologies": 1, "_id": 0}
    ).limit(5).to_list(length=5)
    
    for s in sample:
        print(f"   '{s['title']}' -> {s['technologies']}")

if __name__ == "__main__":
    asyncio.run(check_data())