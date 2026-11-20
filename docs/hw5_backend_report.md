# ДЗ №5 — Развертывание Backend и интеграция с Frontend

**Проект:** TrendRadar — трекер технологических трендов (Hacker News + Dev.to)
**Роль:** Backend-разработка (FastAPI + MongoDB), интеграция с React-фронтендом. Код писался в паре с AI-агентом (Claude Code / OpenCode).

---

## 1. Проектирование базы данных (MongoDB)

БД — MongoDB (`mongodb://localhost:27017`, база `trendradar`), доступ из Python — асинхронный драйвер **Motor** (`AsyncIOMotorClient`). Схема коллекций спроектирована вместе с AI-агентом: формулировались требования (какие выборки нужны фронтенду), агент предлагал структуру документов и набор индексов под эти запросы.

### Коллекции (`backend/database.py`)

**`trend_events`** — статьи из обоих источников (один документ = одна статья HN или Dev.to):

| Поле | Тип | Описание |
|---|---|---|
| `id` | int/str | Уникальный идентификатор статьи (HN id или Dev.to id) |
| `title` | str | Заголовок |
| `url` | str | Ссылка на оригинал |
| `score` | int | Рейтинг (очки HN / positive reactions Dev.to) |
| `descendants` | int | Число комментариев |
| `created_at` | datetime | Дата публикации (у Dev.to — `published_timestamp`) |
| `technologies` | array[str] | Извлечённые технологии (`["Python", "MongoDB", …]`) |
| `sentiment` | str | Тональность: `positive` / `neutral` / `negative` |
| `category` | str | Категория (`AI`, `Web`, `Python`, `Database`, `DevOps`…) |
| `source` | str | Источник: `hackernews` или `devto` |

`technologies`, `sentiment` и `category` заполняет AI-слой колектора (LLM `qwen2.5:0.5b` через локальную Ollama, с keyword-fallback при недоступности LLM).

**`users`** — пользователи GitHub OAuth:

| Поле | Тип |
|---|---|
| `github_id` | str (уникальный) |
| `username` | str |
| `email` | str |
| `avatar_url` | str |
| `weekly_digest` | bool |
| `created_at` | datetime |

**`favorites`** — избранное конкретного пользователя:

| Поле | Тип |
|---|---|
| `user_key` | str (id пользователя из JWT) |
| `article_id` | int/str (id статьи из `trend_events`) |
| `technologies` | array[str] (копия тегов статьи — на ней строится умная лента) |
| `added_at` | datetime |

*(в коде используется `user_key`, а не `user_id` — ключ совместим и с тестовыми пользователями, и с GitHub-аккаунтами)*

**`subscriptions`** — подписки на технологии (появилась в развитии проекта): `user_key` + `technology` (уникальная пара), `last_seen_at` для счётчика «+N новых».

### Индексы создаются автоматически при старте

Индексы создаёт `init_db()`, вызванная из **lifespan** приложения (`main.py`: `@asynccontextmanager` → `await init_db()` при старте uvicorn). Ручной подготовки БД не требуется — поднял бэкенд, и база готова к быстрой работе:

- `trend_events`: **уникальный индекс по `id`** (защита от дублей), `created_at` (сортировка лент и окна выборок), `technologies`, `sentiment`, `category` (фильтры Explorer и группировки графа);
- `favorites`: составной **уникальный `(user_key, article_id)`** + `user_key` + `added_at`;
- `users`: **уникальный `github_id`** + `username`;
- `subscriptions`: составной уникальный `(user_key, technology)`.

Там же в `init_db()` выполняется миграция: удаляется устаревший глобально-уникальный индекс `favorites.article_id_1`, который мешал хранить избранное нескольких пользователей.

---

## 2. Создание API (FastAPI)

Приложение — `backend/main.py` (`uvicorn main:app --port 8000`), роутеры разложены по файлам в `backend/routers/`. Код роутеров генерировался AI-агентом: агенту давалась постановка («нужен endpoint X с фильтрами Y, ответ такого вида»), дальше — ревью и проверка через автодокументацию `/docs` (Swagger UI из коробки FastAPI).

### Ключевые эндпоинты

| Метод и путь | Назначение |
|---|---|
| `GET /api/trends/summary` | Сводка для дашборда: всего статей, топ-технология, распределение тональности, мета-тренды (данные для KPI-карточек и графиков) |
| `GET /api/trends/{tech}/timeline` | Хронология упоминаний технологии по дням — линейный график |
| `GET /api/trends/search?q=&technology=&min_score=&sentiment=&sort_by=&limit=&skip=` | Поиск статей с фильтрами (технология, тональность, минимальный рейтинг), сортировкой (дата/рейтинг/комментарии) и пагинацией (`{"items": [...], "total": N}`) |
| `GET /api/graph` | Узлы/рёбра для vis-network: технологии как узлы (вес = упоминания), совместные упоминания как рёбра, категория узла в `group` |
| `GET /api/trends/hidden-gems` | «Скрытые жемчужины»: высокий `score` при низком `descendants` |
| `POST /api/trends/summarize/{article_id}` | AI-саммари: запрос к локальной Ollama (`qwen2.5:0.5b`), при её недоступности — fallback `{"summary": "AI временно недоступен"}` |
| `GET /api/trends/compare?tech=A,B&days=14` | Сравнение нескольких технологий на одном периоде |
| `GET/POST/DELETE /api/favorites…`, `/api/subscriptions…`, `GET /api/feed` | Пользовательские данные (Bearer JWT) |
| `GET /api/auth/github`, `/api/auth/github/callback`, `/api/auth/me` | GitHub OAuth + текущий пользователь |

### CORS

Настроен в `main.py` через `CORSMiddleware` (тоже с помощью AI — включая разбор типичной ошибки «CORS policy: No 'Access-Control-Allow-Origin'»):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # только фронтенд
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 3. Безопасность

- **JWT-авторизация.** После OAuth бэкенд выпускает JWT (`python-jose`, HS256, срок жизни 30 дней, claim `sub` = github_id, `exp`). Защищённые эндпоинты (избранное, подписки, лента) читают заголовок `Authorization: Bearer …` (`get_token_from_header` → `decode_token`), при отсутствии/просрочке токена — `401`. Фронтенд хранит токен в `localStorage` и добавляет его к запросам через обёртку `authFetch`.
- **OAuth2 через GitHub.** `GET /api/auth/github` редиректит на `github.com/login/oauth/authorize` (scope `read:user`); в callback бэкенд обменивает `code` на `access_token` (`httpx`), получает профиль с `api.github.com/user` и **создаёт/обновляет сессию** — пользователь пишется в `users` через `update_one(..., upsert=True)` (повторный вход не плодит дубликатов), после чего клиент получает JWT и редирект на `{FRONTEND_URL}/auth/callback?token=…`.
- **CORS.** Доступ разрешён только с origin фронтенда `http://localhost:5173` (`allow_credentials=True` — на случай перехода на httpOnly cookies).
- **Защита секретов.** Все чувствительные значения — в `.env` (gitignored), не в коде: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `JWT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`, `MONGODB_URL`, `DATABASE_NAME`. Чтение через `python-dotenv` + `os.getenv` с безопасными дефолтами. В репозиторий положен `.env.example` с перечнем переменных без значений.

---

## 4. Интеграция Frontend–Backend

- **Транспорт — нативный `fetch`** (без тяжёлых HTTP-клиентов): страницы вызывают `fetch("http://localhost:8000/api/…")`, а для авторизованных запросов — обёртку `authFetch` из `AuthContext`, которая сама подставляет `Authorization: Bearer <token>` из `localStorage` и умеет реагировать на `401`.
- **Обработка ошибок.** Каждая страница ловит исключения (`try/catch` + `response.ok`): при недоступном API пользователь видит внятное состояние «Ошибка загрузки, попробуйте ещё» с кнопкой Retry/перегрузкой — а не белый экран. Задействованные паттерны:
  - skeleton-заглушки и спиннеры на время загрузки (`Dashboard`);
  - `AbortController` в cleanup `useEffect` — отмена устаревших запросов при смене фильтров (Explorer, Graph), чтобы на экран не выводился ответ гонки;
  - деградация AI-функций: недоступная Ollama не ломает страницу — `ArticleCard` показывает fallback-сообщение;
  - понятные коды: `401` → подсказка войти (подписки/лента), `404` → «нет данных», ошибки сети → Retry.
- **Контракт форматов согласован на обеих сторонах:** `{items, total}` для пагинации, ISO-строки дат в JSON (даты Mongo сериализуются в `isoformat()`), `personalized: bool` у фида — всё это фиксировалось в ТЗ (`docs/hw3_ui_and_spec.md`) и проверялось интеграционно.
- **Единая точка API-URL:** `API_BASE_URL = "http://localhost:8000"` во фронтенде и `BACKEND_URL` в `.env` бэкенда — запуск «двух терминалов» (uvicorn :8000 + Vite :5173) полностью поднимает систему.

---

## 5. Использование AI для отладки

AI-агент участвовал не только в написании кода, но и в разборе ошибок: текст исключения и контекст передавались агенту, он локализовывал причину и предлагал правку, которая сразу проверялась на живом сервере.

**Характерный пример.** С помощью AI-агента была исправлена ошибка **`DuplicateKeyError`** в MongoDB: при повторных сборах коллекция падала на дубликатах статей. Разбор агента показал, что проблема системная — «нет уникального индекса + вставка без учёта уже существующих `id`». Итоговое решение:

1. **уникальный индекс `trend_events.id`**, создаваемый в `init_db()` при старте (lifespan) — дубль теперь невозможен на уровне БД;
2. **фильтрация дубликатов перед вставкой** в `save_trend_events()` (сверка набора существующих `id`) — колектор может запускаться повторно без ошибок;
3. **upsert для пользователей** (`users.update_one({"github_id": …}, {"$set": …}, upsert=True)`) — повторный вход через GitHub не создаёт второго документа;
4. попутно миграция индексов `favorites`: устаревший глобально-уникальный `article_id_1` удалялся при старте и заменялся составным `(user_key, article_id)`.

Другие отладочные кейсы с AI: настройка CORS (ошибка «blocked by CORS policy»), несовпадение имён переменных окружения в `.env` и `os.getenv` (молчаливый fallback на localhost), согласование формата ответа `/api/trends/search` с пагинацией фронтенда, часовые пояса при сравнении `created_at` в умной ленте.

---

## Вывод

Backend TrendRadar развёрнут как самостоятельный сервис FastAPI + MongoDB: схема из четырёх коллекций с индексами, создаваемыми автоматически при старте, ~20 эндпоинтов под все экраны фронтенда, JWT + GitHub OAuth, CORS только для Vite-клиента и секреты в `.env`. Интеграция с React-фронтендом построена на `fetch` с аккуратной обработкой ошибок на каждой странице. AI-агент ускорил и написание кода, и отладку — от CORS и контрактов API до исправления `DuplicateKeyError` через уникальные индексы и upsert.
