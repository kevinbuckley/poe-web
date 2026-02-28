import asyncio
import logging

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Message
from app.services.orchestrator import orchestrator

logger = logging.getLogger(__name__)


async def run_turn_background(session_id: str, user_message_id: str, mention_persona_id: str | None) -> None:
    db: Session = SessionLocal()
    try:
        user_message = db.get(Message, user_message_id)
        if user_message is None:
            logger.warning("user message %s missing", user_message_id)
            return

        await orchestrator.run_turn(
            db=db,
            session_id=session_id,
            user_message=user_message,
            mention_persona_id=mention_persona_id,
        )
    except Exception:
        logger.exception("background run_turn failed")
    finally:
        db.close()


def schedule_turn(session_id: str, user_message_id: str, mention_persona_id: str | None) -> None:
    asyncio.create_task(run_turn_background(session_id, user_message_id, mention_persona_id))
