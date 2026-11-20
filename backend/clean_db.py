"""ОПАСНО: полная очистка базы TrendRadar.

Использует те же переменные окружения, что и приложение:
    MONGODB_URL (по умолчанию mongodb://localhost:27017)
    DATABASE_NAME (по умолчанию trendradar)

Запускать только осознанно — удаление необратимо.
"""

import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "trendradar")

client = MongoClient(MONGODB_URL)
db = client[DATABASE_NAME]


def main() -> None:
    print(f"⚠️  Будет очищена база «{DATABASE_NAME}» ({MONGODB_URL}):")
    print("   - trend_events (все статьи)")
    print("   - technologies (справочник тегов, если создавалась)")
    answer = input("Продолжить? Введите YES для подтверждения: ").strip()

    if answer != "YES":
        print("Отменено — база не тронута.")
        sys.exit(0)

    # 1. Очищаем все события (новости)
    result_events = db["trend_events"].delete_many({})
    print(f"Удалено записей из trend_events: {result_events.deleted_count}")

    # 2. Очищаем справочник технологий (чтобы не оставалось "пустых" тегов)
    result_techs = db["technologies"].delete_many({})
    print(f"Удалено технологий из technologies: {result_techs.deleted_count}")

    # 3. (Опционально) Очищаем пользователей, если вы их создавали
    # result_users = db["users"].delete_many({})
    # print(f"Удалено пользователей: {result_users.deleted_count}")

    print("\nБаза данных полностью очищена. Можно запускать сборщик заново.")


if __name__ == "__main__":
    main()
