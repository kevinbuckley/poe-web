# Architecture Overview

- Web UI (Next.js) streams panel events over SSE.
- FastAPI backend owns REST APIs, persistence, moderation, and orchestration flow.
- Orchestrator implements mediator-guided turn taking, persona injection, and summary handoffs.
- Redis supports queueing/event fanout and Celery tasks.
- Postgres stores durable state (personas, panels, sessions, messages, events, summaries).

## Memory model

- Immediate working memory: last N messages in active prompt.
- Episodic memory: durable event/message log.
- Semantic memory: external read-only RAG adapters by persona.
