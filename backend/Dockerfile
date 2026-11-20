# TrendRadar backend: FastAPI + Motor (MongoDB)
FROM python:3.14-slim

WORKDIR /app/backend

# Зависимости отдельным слоем — кэш при изменении кода
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# .env пробрасывается через docker-compose (environment), не запекается в образ
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
