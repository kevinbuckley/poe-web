# API Contract Summary

## Endpoints

- `POST /v1/personas`
- `GET /v1/personas/{persona_id}`
- `POST /v1/panels`
- `GET /v1/panels/{panel_id}`
- `POST /v1/sessions`
- `POST /v1/sessions/{session_id}/messages`
- `GET /v1/sessions/{session_id}/events` (SSE)
- `POST /v1/sessions/{session_id}/interrupt`
- `GET /v1/sessions/{session_id}/summary`

## SSE events

- `session.started`
- `mediator.status`
- `agent.status.changed`
- `agent.token`
- `agent.message.completed`
- `agent.interrupt.triggered`
- `memory.summary.updated`
- `session.error`
- `session.completed`
