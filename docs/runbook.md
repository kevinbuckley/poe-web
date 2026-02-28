# Runbook

## Local startup

1. `cp .env.example .env`
2. `make infra-up`
3. `cd services/api && uv sync`
4. `cd services/worker && uv sync`
5. `pnpm install`
6. `make api`
7. `make worker`
8. `make web`

## Smoke test

- API: `GET /v1/health`
- Create personas -> panel -> session -> post message -> stream `/events`

## Incident hints

- If SSE stalls, inspect API logs and Redis availability.
- If worker tasks back up, scale worker replicas or inspect Celery broker lag.
