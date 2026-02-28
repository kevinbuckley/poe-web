# POE Platform

Web-first Panel of Experts implementation.

## Stack

- Web: Next.js (Vercel target)
- API: FastAPI + LangGraph-oriented orchestration
- Workers: Celery + Redis
- Data: Postgres + pgvector

## Quick start

1. Copy `.env.example` to `.env` and fill keys.
2. Start infra: `make infra-up`
3. Start API: `make api`
4. Start worker: `make worker`
5. Start web: `make web`

## Repo layout

- `apps/web`: Next.js app
- `packages/contracts`: shared API/types
- `packages/ui`: shared UI components
- `services/api`: FastAPI, DB models, orchestration, Alembic
- `services/worker`: Celery worker tasks
- `infra/*`: Docker, Vercel, Railway configs
- `docs`: architecture and runbooks
