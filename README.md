# 🚀 TrendRadar

**TrendRadar** — это система поддержки принятия решений (DSS) для мониторинга и анализа технологических трендов в реальном времени. Проект собирает данные из IT-сообществ (Hacker News + Dev.to), анализирует их с помощью локальной LLM и визуализирует связи между технологиями.

## ✨ Ключевые возможности
- **Мультиисточниковый сбор:** Hacker News API + Dev.to API, каждая статья помечается полем `source`.
- **AI-анализ:** локальная LLM (Ollama, Qwen 2.5) для генерации кратких саммари статей и извлечения сущностей (технологии, тональность, категория); fallback по ключевым словам без LLM.
- **Интерактивный граф:** визуализация связей технологий с кластеризацией по категориям (Vis-Network), фокусом на узле, похожими технологиями, толщиной рёбер по силе связи, поиском технологии с автодополнением и единой спокойной палитрой в светлой/тёмной теме.
- **Единый язык интерфейса:** весь UI на английском (заголовки статей HN/Dev.to остаются на английском — это данные источников).
- **Аналитика:** таймлайн трендов, сравнение 2–4 технологий на одном графике, распределение тональности, виджет «💎 Скрытые жемчужины».
- **Персонализация:** система «Избранное», подписки на технологии со счётчиком «+N новых» и умная лента «🤖 Для вас» (JWT + GitHub OAuth).
- **Экспорт:** выгрузка отфильтрованных данных в CSV.
- **Админ-панель:** скрытая страница со статистикой базы и управлением данными.

## 🛠 Технологический стек
- **Frontend:** React 18, Vite, Tailwind CSS (CDN), Recharts/Chart.js, Vis-Network.
- **Backend:** Python, FastAPI, MongoDB (Motor), Pydantic, python-jose.
- **AI/Data:** Ollama (локальная LLM), Rule-based NER + словарный анализ тональности (fallback).
- **Collector:** Python, httpx, APScheduler.
- **Инфраструктура:** Docker Compose, GitHub Actions (CI/CD).

```text
Hacker News Firebase API ─┐
                          ├─→ collector/ (httpx + Ollama + APScheduler) ─→ MongoDB (trendradar)
Dev.to API ───────────────┘                                                        │
                                                                                   ▼
                                        frontend/ (React 18 + Vite + Tailwind) ←─ backend/ (FastAPI + Motor), REST /api/*
```

> Коллектор пишет в MongoDB напрямую через модули `backend/database.py`, а не через API. Backend и collector используют общую базу `trendradar`.

## 🚀 Быстрый старт (Windows)

1. **База данных (MongoDB):**
   Убедитесь, что MongoDB запущена локально на порту `27017`.

2. **Бэкенд:**
   ```powershell
   cd backend
   ..\.venv\Scripts\Activate.ps1
   python -m uvicorn main:app --reload
   ```
   - API: http://localhost:8000, Swagger UI: http://localhost:8000/docs
   - Запускать именно из папки `backend/`: в проекте абсолютные импорты вида `from database import ...`.

3. **Коллектор (Hacker News + Dev.to):**
   ```powershell
   cd collector
   ..\.venv\Scripts\Activate.ps1
   python scheduler.py
   ```
   Первичный сбор — до 300 статей, затем по 50 статей (HN + Dev.to) каждые 5 минут. Разовая проверка без планировщика: `python hn_collector.py`.

4. **Ollama (опционально, для AI-функций):**
   ```powershell
   ollama serve
   ollama pull qwen2.5:0.5b
   ```
   Без Ollama проект тоже работает: установите `USE_LLM = False` в `collector/ai_agent.py` — включится быстрое извлечение по ключевым словам.

5. **Фронтенд:**
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   Откройте http://localhost:5173. Vite должен держать именно порт `5173` — backend CORS разрешает только этот origin.

> Python-окружение: `python -m venv .venv` → `.venv\Scripts\python.exe -m pip install -r backend\requirements.txt -r collector\requirements.txt` (проект проверен на Python 3.14).

## 🐳 Docker Compose — весь стек одной командой

```powershell
docker compose up --build
```

Поднимаются пять сервисов: `mongo` (MongoDB 7, данные в volume), `backend` (FastAPI :8000), `ollama` (LLM), `collector` (планировщик сбора), `frontend` (nginx :5173 с SPA-роутингом). Порты те же, что при локальном запуске, — CORS и `API_BASE_URL` работают без изменений кода.

> **Требование:** Docker Desktop на Windows работает через WSL2. Если `wsl --status` говорит, что подсистема не установлена — сначала выполните `wsl --install` и перезагрузите компьютер, затем запускайте `docker compose up --build`. Перед стартом остановите локальный `mongod`, чтобы не было конфликта за порт 27017.

После первого старта подтяните модель:

```powershell
docker compose exec ollama ollama pull qwen2.5:0.5b
```

Секреты (`JWT_SECRET`, `GITHUB_CLIENT_ID/SECRET`) передаются контейнерам через переменные окружения, а не запекаются в образы; `.env` исключён из сборки через `.dockerignore`.

## 🔐 Переменные окружения

Ключи и пароли хранятся в `backend/.env` (gitignored) — не в коде. Шаблон: `backend/.env.example`.

| Переменная | Где используется | По умолчанию |
|---|---|---|
| `MONGODB_URL` | `backend/database.py` | `mongodb://localhost:27017` |
| `DATABASE_NAME` | `backend/database.py` | `trendradar` |
| `GITHUB_CLIENT_ID` | `backend/routers/auth.py` | — |
| `GITHUB_CLIENT_SECRET` | `backend/routers/auth.py` | — |
| `JWT_SECRET` | `backend/routers/auth.py` | — (обязателен; без него генерируется случайный ключ на запуск) |
| `FRONTEND_URL` | `backend/routers/auth.py` | `http://localhost:5173` |
| `BACKEND_URL` | `backend/routers/auth.py` | `http://localhost:8000` |
| `HN_API_URL` | `collector/hn_collector.py` | `https://hacker-news.firebaseio.com/v0` |
| `DEVTO_API_URL` | `collector/devto_collector.py` | `https://dev.to/api/articles` |
| `DEVTO_DAYS` / `DEVTO_PER_PAGE` | `collector/devto_collector.py` | `7` / `50` |
| `OLLAMA_URL` | `backend/routers/trends.py`, `collector/ai_agent.py` | `http://localhost:11434` |
| `OLLAMA_MODEL` | `backend/routers/trends.py`, `collector/ai_agent.py` | `qwen2.5:0.5b` |
| `ADMIN_KEY` | `backend/routers/admin.py` | — (обязателен; без него `/api/admin/*` отвечает 503) |

> **Важно:** и `backend/.env.example`, и `collector/.env.example` используют те же имена переменных, что и код (`MONGODB_URL`, `DATABASE_NAME`). При отсутствии значений используются дефолты `localhost:27017` и `trendradar`. `USE_LLM` — не переменная окружения, а константа в `collector/ai_agent.py`.

Для GitHub OAuth создайте OAuth App: Homepage URL `http://localhost:5173`, callback `http://localhost:8000/api/auth/github/callback`.

## 🛡️ Безопасность

- **Секреты живут только в `backend/.env`** — файл исключён из git (`.gitignore`) и из образа (`.dockerignore`); в репозитории лежит лишь шаблон `backend/.env.example` без значений.
- **Обязательные переменные:** `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `JWT_SECRET`, `ADMIN_KEY`. Без `JWT_SECRET` токены подписываются случайным ключом на время запуска (после рестарта все сессии сбрасываются), без `ADMIN_KEY` все `/api/admin/*` отвечают `503`.
- **Генерация ключей:**

  ```powershell
  python -c "import secrets; print(secrets.token_hex(32))"     # JWT_SECRET
  python -c "import secrets; print(secrets.token_urlsafe(24))" # ADMIN_KEY
  ```

- **Админ-доступ** — заголовок `X-Admin-Key`, сравнение через `secrets.compare_digest`. Дефолтный `admin123` из ранних версий больше не принимается.
- **Ротация при утечке:** перегенерируйте `GITHUB_CLIENT_SECRET` (GitHub → Settings → Developer settings → OAuth Apps) и `JWT_SECRET`, обновите `backend/.env`, затем `docker compose up -d --force-recreate backend`.
- **Mongo без аутентификации**, а порт `27017` опубликован на все интерфейсы — не выставляйте машину в интернет; для локальной работы можно сузить проброс до `127.0.0.1:27017:27017`.

## 📡 API

| Метод | Endpoint | Назначение |
|---|---|---|
| GET | `/api/trends/summary` | Общее количество статей, топ-технология и распределение тональности |
| GET | `/api/trends/search?q=&technology=&sort_by=date&limit=25&skip=0` | Поиск с сортировкой и пагинацией; возвращает `{"items": [...], "total": N}` |
| GET | `/api/trends/compare?tech=A,B&days=14` | Упоминания 2–4 технологий по дням для общего графика |
| GET | `/api/trends/hidden-gems` | «Скрытые жемчужины»: `score > 100` и `descendants < 5`, топ-3 по рейтингу |
| POST | `/api/trends/summarize` | AI-саммари статьи через Ollama (таймаут 30 с, fallback «AI временно недоступен») |
| GET | `/api/trends/{technology}/articles?limit=10&skip=0&sort_by=date` | Статьи по технологии |
| GET | `/api/trends/{technology}/timeline` | Упоминания технологии по дням |
| GET | `/api/trends/similar/{technology}?limit=3` | Технологии, которые чаще всего упоминаются вместе с указанной |
| GET | `/api/graph` | Узлы и связи графа технологий |
| GET | `/api/health` | Health Check: `{"status": "ok", "database": "ok"}` при живой MongoDB, иначе `503` |
| GET | `/api/admin/stats` | KPI админ-панели: статьи, технологии, последний сбор, источники (HN/Dev.to) |
| POST | `/api/admin/clear` | Очистить коллекцию `trend_events` (заголовок `X-Admin-Key`, задаётся `ADMIN_KEY`) |
| GET | `/api/favorites` | Избранное текущего пользователя (Bearer JWT, обязательный заголовок) |
| POST | `/api/favorites` | Добавить статью в избранное пользователя |
| DELETE | `/api/favorites/{article_id}` | Удалить статью из избранного пользователя |
| GET | `/api/favorites/check/{article_id}` | Проверить, есть ли статья в избранном (без токена — `false`) |
| GET | `/api/subscriptions` | Подписки пользователя со счётчиком новых статей (Bearer JWT) |
| POST | `/api/subscriptions` | Подписаться на технологию (`{"technology": "Python"}`) |
| DELETE | `/api/subscriptions/{technology}` | Отписаться от технологии |
| POST | `/api/subscriptions/{technology}/visit` | Отметить просмотренной — сброс счётчика новых |
| GET | `/api/feed?limit=15` | Умная лента «Для вас»: ранжирование по подпискам, избранному и свежести (Bearer JWT; без токена — пустой фид) |
| GET | `/api/auth/github` | Начать GitHub OAuth |
| GET | `/api/auth/github/callback` | Callback GitHub OAuth → редирект на `/auth/callback?token=...` |
| GET | `/api/auth/me` | Текущий пользователь по Bearer JWT |
| POST | `/api/auth/logout` | Выход (клиент удаляет токен) |

## 🗃 Модель данных

| Коллекция | Поля |
|---|---|
| `trend_events` | `id` (уникальный id статьи), `title`, `url`, `score`, `descendants`, `created_at`, `source` (`hackernews` / `devto`), `technologies[]`, `sentiment`, `category` |
| `favorites` | `user_key` (github_id из JWT), `article_id` (уникальная пара `user_key + article_id`), `title`, `url`, `score`, `technologies[]`, `added_at` |
| `subscriptions` | `user_key`, `technology` (уникальная пара), `subscribed_at`, `last_seen_at` — статьи после `last_seen_at` считаются новыми |
| `users` | `github_id` (уникальный), `username`, `avatar_url`, `email`, `weekly_digest` |

Индексы создаются автоматически при старте backend (lifespan → `init_db()`): уникальный `trend_events.id`, `created_at`, `technologies`, составные уникальные пары для `favorites` и `subscriptions`.

## 🧪 Проверки и CI/CD

- **GitHub Actions** (`.github/workflows/deploy.yml`) — на каждый пуш/PR в `main`: lint (flake8/eslint), smoke-импорт FastAPI-приложения, `npm audit`, production-сборка `npm run build`. Деплой на Vercel/Railway активируется секретами `VERCEL_TOKEN`/`RAILWAY_TOKEN`.
- **Проверки локально:** `npm run build` (frontend), `py_compile` всех Python-файлов, `check_db.py` / `check_db_detailed.py` (диагностика БД, только чтение).
- **Безопасность:** CORS только `http://localhost:5173`, Pydantic-валидация тел запросов, секреты в `.env`; аудит `npm audit` + `pip-audit` проведён (детали — в отчёте ДЗ №6).

## 📚 Документация

- [AGENTS.md](./AGENTS.md) — инструкции и особенности репозитория для AI-агентов.
- [CLAUDE.md](./CLAUDE.md) — правила для Claude Code.
- [docs/README.md](./docs/README.md) — индекс документации.
- [ДЗ №1. Выбор AI-инструментов](./docs/hw1_ai_tools.md)
- [ДЗ №2. Файл правил для AI-агента](./docs/hw2_rules.md)
- [ДЗ №2. Библиотека промпт-шаблонов](./docs/hw2_prompt_templates.md)
- [ДЗ №3. UI-концепции и техническое задание](./docs/hw3_ui_and_spec.md)
- [ДЗ №4. Отчёт по frontend-разработке с AI-агентом](./docs/hw4_frontend_report.md)
- [ДЗ №5. Отчёт по backend-разработке и интеграции](./docs/hw5_backend_report.md)
- [ДЗ №6. Отчёт по CI/CD и интеграции сервисов](./docs/hw6_integrations_report.md)

## 📌 Известные ограничения

- Старые записи в базе без поля `source` считаются Hacker News по домену url.
- Автоматических тестов нет; проверка выполняется CI-пайплайном (lint, аудит, сборка) и вручную.
- Справочник технологий продублирован в нескольких файлах (`collector/ai_agent.py`, `backend/routers/graph.py`, `frontend/src/pages/Explorer.jsx`, `Graph.jsx`) — при добавлении технологии обновлять согласованно.
- Для выноса API на другой хост задайте `VITE_API_URL` в `frontend/.env` — все страницы читают базовый URL из `src/config.js` (по умолчанию `http://localhost:8000`).
- Старый уникальный индекс `favorites.article_id` мигрирует автоматически при старте backend (на пару `user_key + article_id`).
