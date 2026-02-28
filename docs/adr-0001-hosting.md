# ADR-0001: Hosting Topology

## Decision

Deploy Next.js web on Vercel and keep Python API/worker on Railway/Fly.

## Context

- Long-lived SSE and background workers are less predictable in serverless-only topologies.
- Python LangGraph ecosystem and Celery pipelines are first-class in external container runtimes.

## Consequences

- Requires CORS and external API URL wiring.
- Better operational control for orchestration and worker scaling.
