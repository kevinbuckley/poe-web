.PHONY: dev web api worker infra-up infra-down lint typecheck test

dev:
	pnpm dev

web:
	cd apps/web && pnpm dev

api:
	cd services/api && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

worker:
	cd services/worker && uv run celery -A worker.celery_app worker --loglevel=INFO

infra-up:
	docker compose -f infra/docker/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker/docker-compose.yml down -v

lint:
	pnpm lint
	cd services/api && uv run ruff check .
	cd services/worker && uv run ruff check .

typecheck:
	pnpm typecheck
	cd services/api && uv run mypy app
	cd services/worker && uv run mypy worker

test:
	pnpm test
	cd services/api && uv run pytest
	cd services/worker && uv run pytest
