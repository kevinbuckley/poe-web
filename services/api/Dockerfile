FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

# Paths are relative to repo root (Railway build context)
COPY services/api/pyproject.toml services/api/README.md ./
COPY services/api/app ./app
COPY services/api/alembic.ini ./
COPY services/api/alembic ./alembic

RUN uv pip install --system .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
