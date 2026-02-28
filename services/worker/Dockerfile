FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml README.md ./
COPY worker ./worker

RUN uv pip install --system .

CMD ["celery", "-A", "worker.celery_app", "worker", "--loglevel=INFO"]
