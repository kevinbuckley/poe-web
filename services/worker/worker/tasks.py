from datetime import datetime

from sqlalchemy import create_engine, text

from worker.celery_app import celery
from worker.config import get_settings

settings = get_settings()


@celery.task(name="worker.tasks.generate_summary_handoff")
def generate_summary_handoff(session_id: str) -> dict[str, str]:
    # Placeholder task for summary pipeline orchestration.
    return {
        "session_id": session_id,
        "status": "queued",
        "generated_at": datetime.utcnow().isoformat(),
    }


@celery.task(name="worker.tasks.evaluate_persona_drift")
def evaluate_persona_drift(session_id: str, persona_id: str) -> dict[str, str]:
    # Placeholder task for drift policy checks.
    return {
        "session_id": session_id,
        "persona_id": persona_id,
        "status": "evaluated",
        "generated_at": datetime.utcnow().isoformat(),
    }


@celery.task(name="worker.tasks.db_smoke")
def db_smoke() -> dict[str, str | int]:
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    with engine.connect() as conn:
        value = conn.execute(text("SELECT 1")).scalar_one()
    return {"status": "ok", "value": int(value)}
