# ДЗ №2. Библиотека промпт-шаблонов (RTCF)

**RTCF** — структура промпта из четырёх блоков:

- **Role** — кем должен быть агент, какие навыки и уровень экспертизы включить.
- **Task** — что именно нужно сделать, какой результат считается готовым.
- **Context** — факты о проекте, файлы, контракты API, ограничения и уже принятые решения.
- **Format** — в каком виде вернуть ответ: файлы, diff, тесты, команды, план.

Шаблоны ниже рассчитаны на проект TrendRadar, но легко адаптируются под другие задачи. В квадратных скобках `{{...}}` указаны места для подстановки.

---

## 1. Генерация компонента: график тональности

### Шаблон

```text
Role: Ты — Senior Frontend-разработчик с опытом React 18, Chart.js и Tailwind CSS. Пишешь функциональные компоненты с хуками, без классов и без лишних зависимостей.

Task: Создай компонент {{component_path}} для визуализации {{chart_type}}. Компонент должен:
- принимать данные через props и не делать запросы к API самостоятельно;
- корректно обрабатывать состояния loading, empty и error;
- поддерживать светлую и тёмную тему;
- быть готовым к встраиванию в {{parent_component}}.

Context:
- Проект: TrendRadar, frontend на React 18 + Vite, стили — Tailwind CSS через CDN, тёмная тема через класс `dark`.
- Уже установлены: {{installed_libs}}.
- Контракт данных: {{data_contract}}.
- Пример данных из API: {{sample_data}}.
- Существующий стиль компонентов: {{style_example}}.
- Ограничения: не добавлять новые библиотеки, не использовать `var`, не оставлять `console.log`, не переводить проект на TypeScript.

Format:
1. Полный код файла с комментарием пути в первой строке.
2. Краткое описание props и их типов.
3. Пример использования в родительском компоненте.
4. Команда проверки сборки frontend.
```

### Пример использования

**Что вписано в Context:**

```text
Проект: TrendRadar, React 18 + Vite, Tailwind через CDN, darkMode: 'class'.
Установлены chart.js 4.6.1 и react-chartjs-2 5.3.1.
Нужен frontend/src/components/SentimentChart.jsx — doughnut-график тональности.
Контракт: { sentiment: { positive: number, neutral: number, negative: number } }.
Пример: { "positive": 42.5, "neutral": 50.0, "negative": 7.5 }.
Родитель: Dashboard.jsx, данные приходят из GET /api/trends/summary.
Цвета: positive — #10B981, neutral — #6B7280, negative — #EF4444.
```

**Полученный результат:** компонент `SentimentChart` на `Doughnut` из `react-chartjs-2` с регистрацией `ArcElement`, `Tooltip` и `Legend`, процентами в подсказках, пустым состоянием и адаптацией цветов легенды под тёмную тему. В `Dashboard.jsx` добавлен импорт и блок с графиком; `npm run build` проходит после установки недостающих зависимостей.

Ключевой фрагмент результата:

```jsx
// file: frontend/src/components/SentimentChart.jsx
const SentimentChart = ({ sentiment, loading }) => {
  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!sentiment) return <div className="p-8 text-center">No data</div>;

  const data = {
    labels: ["Positive", "Neutral", "Negative"],
    datasets: [{
      data: [sentiment.positive, sentiment.neutral, sentiment.negative],
      backgroundColor: ["#10B981", "#6B7280", "#EF4444"],
      borderWidth: 0,
    }],
  };

  return <Doughnut data={data} options={{ responsive: true, maintainAspectRatio: false }} />;
};
```

---

## 2. Рефакторинг кода: оптимизация запроса к MongoDB

### Шаблон

```text
Role: Ты — Senior Python-разработчик и эксперт по MongoDB/Motor. Умеешь читать explain-планы, сокращать число round-trip и сохранять обратную совместимость API.

Task: Отрефактори {{file_path}} в функции {{function_name}}. Нужно {{optimization_goal}}, не меняя контракт ответа. Сначала объясни проблему, затем предложи минимальный diff.

Context:
- Проект: TrendRadar, FastAPI + Motor, база `trendradar`.
- Коллекция: {{collection_name}}.
- Поля документа: {{document_fields}}.
- Существующие индексы: {{indexes}}.
- Текущий код: {{current_code}}.
- Ограничения: {{constraints}}.
- Размер данных: {{data_size}}.

Format:
1. Краткий анализ: где лишние запросы/сканы и почему.
2. Diff или полная новая версия функции.
3. Объяснение агрегации/индексов.
4. Команды проверки и ожидаемый эффект.
5. Не менять несвязанные эндпоинты и не добавлять зависимости.
```

### Пример использования

**Что вписано в Context:**

```text
Файл: backend/routers/trends.py, функция get_trend_summary.
Коллекция: trend_events.
Поля: id, title, technologies (array), sentiment, category, created_at.
Индексы: id (unique), created_at, technologies, sentiment, category.
Сейчас три отдельных запроса: count_documents, aggregate для top_tech и aggregate для sentiment.
Нужно сократить число round-trip до одного, сохранив ответ { total_count, top_tech, top_tech_count, sentiment }.
```

**Полученный результат:** функция переписана на одну агрегацию с `$facet`; ответ сохранил прежнюю структуру, добавлена защита от пустой коллекции. Число обращений к MongoDB уменьшилось с трёх до одного; для фильтрации по технологии по-прежнему используется существующий индекс `technologies`.

Ключевой фрагмент результата:

```python
pipeline = [
    {
        "$facet": {
            "total": [{"$count": "count"}],
            "top_tech": [
                {"$unwind": "$technologies"},
                {"$group": {"_id": "$technologies", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 1},
            ],
            "sentiment": [
                {"$group": {"_id": "$sentiment", "count": {"$sum": 1}}},
            ],
        }
    }
]
```

---

## 3. Написание тестов: pytest для API

### Шаблон

```text
Role: Ты — Senior QA/Backend-разработчик. Пишешь быстрые изолированные тесты для FastAPI с pytest, pytest-asyncio и httpx.ASGITransport, не поднимая реальный сервер.

Task: Напиши тесты для {{endpoint_group}}. Покрой успешные сценарии, ошибочные статусы и граничные случаи. Тесты должны быть независимыми и не оставлять данные в рабочей БД.

Context:
- Проект: TrendRadar, FastAPI, Motor, MongoDB.
- Тестируемые эндпоинты: {{endpoints}}.
- Контракты: {{contracts}}.
- Текущее состояние тестов: {{test_state}}.
- Доступные зависимости: {{deps}}.
- Ограничения: не использовать реальную базу `trendradar`; не менять production-код без необходимости.

Format:
1. Полный файл `backend/tests/{{test_file}}`.
2. Fixtures и способ изоляции MongoDB.
3. Команда запуска только этих тестов.
4. Список необходимых dev-зависимостей.
5. Краткое объяснение, какие баги могут поймать тесты.
```

### Пример использования

**Что вписано в Context:**

```text
Эндпоинты: GET /api/favorites, POST /api/favorites, DELETE /api/favorites/{article_id}, GET /api/favorites/check/{article_id}.
Контракты: POST принимает article_id, title, url, score, technologies; повторное добавление — 400; удаление несуществующего — 404; check возвращает { is_favorite: bool }.
Тестов в проекте нет. Есть Python 3.14, FastAPI, Motor, httpx.
Нужно добавить pytest, pytest-asyncio и mongomock-motor; рабочую БД не трогать.
```

**Полученный результат:** создан `backend/tests/test_favorites.py` с четырьмя тестами: добавление, повторное добавление (400), удаление (200 и 404), проверка наличия. Коллекции подменяются через `mongomock_motor`, каждый тест получает чистые данные. Команда запуска:

```bash
.venv\Scripts\python.exe -m pytest backend/tests/test_favorites.py -q
```

Фрагмент результата:

```python
async def test_add_duplicate_returns_400(client):
    payload = {"article_id": 1, "title": "Test", "url": "https://example.com"}
    assert (await client.post("/api/favorites", json=payload)).status_code == 200
    assert (await client.post("/api/favorites", json=payload)).status_code == 400
```

---

## 4. Исправление багов: CORS или ReadTimeout

### Шаблон

```text
Role: Ты — Senior debugging-инженер. Действуешь как детектив: сначала собираешь факты, потом формулируешь гипотезы, подтверждаешь причину и делаешь минимальное исправление.

Task: Найди причину ошибки {{error_type}} в {{component}} и предложи минимальный патч. Не делай несвязанных изменений и не маскируй симптом.

Context:
- Проект: TrendRadar, frontend Vite, backend FastAPI, collector на httpx.
- Текст ошибки: {{error_message}}.
- Где воспроизводится: {{reproduction}}.
- Конфигурация: {{config}}.
- Недавние изменения: {{recent_changes}}.
- Ограничения: {{constraints}}.

Format:
1. Список фактов и 2–3 гипотезы.
2. Подтверждённая причина.
3. Минимальный diff с объяснением.
4. Как проверить исправление (команды/шаги в браузере).
5. Что не входит в фикс и почему.
```

### Пример использования

**Что вписано в Context:**

```text
Ошибка в браузере: Access to fetch at 'http://localhost:8000/api/trends/summary' from origin 'http://localhost:5174' has been blocked by CORS policy.
Frontend запущен на 5174, потому что 5173 занят. Backend: allow_origins=["http://localhost:5173"], allow_credentials=True.
Нужно понять, почему CORS не работает, и починить без отключения проверки origin.
```

**Полученный результат:** причина — Vite автоматически перешёл на 5174, а backend разрешает только 5173. Рекомендованный фикс — зафиксировать порт Vite через `strictPort`, чтобы окружение было предсказуемым:

```js
// file: frontend/vite.config.js
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
```

Альтернатива — добавить `http://localhost:5174` в `allow_origins`, но тогда список нужно поддерживать вручную. Проверка: перезапустить Vite, убедиться, что он слушает 5173, и повторить запрос — preflight `OPTIONS` возвращает 200.

Для варианта с **ReadTimeout** в коллекторе результат был другим: причина — Ollama не успевает ответить за 60 секунд на слабом железе. Фикс — увеличить таймаут, добавить повторные попытки и ограничить параллелизм, а не отключать обработку ошибок.

---

## 5. Декомпозиция сложной задачи: сборщик данных с нуля

### Шаблон

```text
Role: Ты — Tech Lead. Умеешь декомпозировать сложную задачу на проверяемые этапы, определять границы файлов, риски и критерии готовности. Код на первом этапе не пишешь.

Task: Разбей задачу «{{task}}» на этапы. Для каждого этапа укажи цель, файлы, критерии готовности, риски и способ проверки. Предложи порядок выполнения и точки, где нужно моё подтверждение.

Context:
- Проект: TrendRadar.
- Стек: {{stack}}.
- Уже существует: {{existing}}.
- Внешние зависимости: {{external_deps}}.
- Ограничения: {{constraints}}.
- Бюджет: {{budget}}.

Format:
1. Таблица этапов: №, цель, файлы, результат, критерии готовности, риск.
2. Порядок выполнения и зависимости между этапами.
3. Что делать не нужно (anti-scope).
4. Первый шаг, который можно начать прямо сейчас.
5. Не выдавай код, пока я не подтвержу план.
```

### Пример использования

**Что вписано в Context:**

```text
Задача: написать collector с нуля — от загрузки Hacker News до записи в MongoDB и запуска по расписанию.
Стек: Python 3.14, httpx, Motor, APScheduler, Ollama qwen2.5:0.5b.
Уже существует: backend/database.py с save_trend_events и индексами, коллекция trend_events.
Внешние зависимости: HN Firebase API, локальная Ollama, MongoDB на localhost:27017.
Ограничения: Windows, нулевой бюджет, без облачных очередей и платных API.
```

**Полученный результат:** план из шести этапов:

| № | Этап | Файлы | Критерий готовности |
|---|---|---|---|
| 1 | Конфигурация и подключение к БД | `collector/.env`, `collector/hn_collector.py` | Читаются `HN_API_URL`, `OLLAMA_URL`, используется общий `database.py` |
| 2 | Клиент HN API | `collector/hn_collector.py` | Загружает top stories, есть timeout и 3 retry |
| 3 | AI-извлечение | `collector/ai_agent.py` | Валидный JSON, нормализация технологий, fallback без LLM |
| 4 | Дедупликация и сохранение | `collector/hn_collector.py` | Повторный запуск не создаёт дубликаты по `id` |
| 5 | Планировщик | `collector/scheduler.py` | Первичный сбор 300, далее 50 каждые 5 минут, корректный shutdown |
| 6 | Наблюдаемость и ручная проверка | `collector/hn_collector.py` | Понятные логи, `python hn_collector.py` обрабатывает 10 статей |

После подтверждения плана работа шла по этапам: сначала клиент и сохранение, затем AI-слой, потом планировщик. Это позволило не смешивать сетевые ошибки, проблемы LLM и ошибки БД в одном большом изменении.

---

## Чек-лист перед отправкой промпта

- [ ] В **Role** указана конкретная роль и уровень экспертизы.
- [ ] В **Task** есть измеримый результат и границы задачи.
- [ ] В **Context** перечислены файлы, контракты, ограничения и примеры данных.
- [ ] В **Format** указано, нужен полный файл, diff, тесты или план.
- [ ] Явно запрещены нежелательные действия: новые зависимости, массовый рефакторинг, `console.log`, хардкод секретов.
- [ ] Для сложной задачи сначала запрошен план, а не готовый код.
