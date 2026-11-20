import asyncio
import logging
import time
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from hn_collector import collect_once
from devto_collector import collect_devto_once

INITIAL_COLLECTION_LIMIT: int = 300
COLLECTION_LIMIT: int = 50
DEVTO_COLLECTION_LIMIT: int = 50
INTERVAL_MINUTES: int = 5

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("scheduler")


async def run_collection_job() -> None:
    """Асинхронная задача для планировщика: Hacker News + Dev.to"""
    logger.info("🔄 Запуск планового сбора данных...")
    try:
        saved_count = await collect_once(limit=COLLECTION_LIMIT)
        logger.info(f"✅ HN: сохранено {saved_count} новых записей")
    except Exception as exc:
        logger.error(f"❌ Ошибка во время сбора HN: {exc}")

    try:
        saved_count = await collect_devto_once(limit=DEVTO_COLLECTION_LIMIT)
        logger.info(f"✅ Dev.to: сохранено {saved_count} новых записей")
    except Exception as exc:
        logger.error(f"❌ Ошибка во время сбора Dev.to: {exc}")


def start_scheduler() -> AsyncIOScheduler:
    """Инициализация асинхронного планировщика"""
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_collection_job, "interval", minutes=INTERVAL_MINUTES)
    scheduler.start()
    logger.info(f"⏱️ Планировщик запущен: сбор каждые {INTERVAL_MINUTES} минут")
    return scheduler


async def run_initial_collection() -> None:
    """Первичный сбор"""
    logger.info("🚀 Запуск первичного сбора данных (Hacker News + Dev.to)...")
    try:
        saved_count = await collect_once(limit=INITIAL_COLLECTION_LIMIT)
        logger.info(f"🎉 Первичный сбор HN завершен: сохранено {saved_count} новых записей")
    except Exception as exc:
        logger.error(f"❌ Ошибка во время первичного сбора HN: {exc}")

    try:
        saved_count = await collect_devto_once(limit=DEVTO_COLLECTION_LIMIT)
        logger.info(f"🎉 Первичный сбор Dev.to завершен: сохранено {saved_count} новых записей")
    except Exception as exc:
        logger.error(f"❌ Ошибка во время первичного сбора Dev.to: {exc}")


async def main():
    print("\n" + "="*60)
    print("🚀 ЗАПУСК TREND RADAR COLLECTOR")
    print("="*60 + "\n")
    
    await run_initial_collection()
    scheduler = start_scheduler()
    
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\n⏹️ Остановка планировщика...")
        scheduler.shutdown()
        logger.info("Планировщик остановлен")


if __name__ == "__main__":
    asyncio.run(main())