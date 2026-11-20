# TrendRadar collector: планировщик HN + Dev.to (контекст сборки — корень репозитория)
FROM python:3.14-slim

WORKDIR /app/collector

# Зависимости колектора отдельным слоем
COPY collector/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Коллектор пишет в Mongo напрямую через модули backend/ (sys.path ../backend)
COPY backend /app/backend
COPY collector .

# OLLAMA_URL задаётся в docker-compose (http://ollama:11434/...)
ENV PYTHONUNBUFFERED=1

CMD ["python", "scheduler.py"]
