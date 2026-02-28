"""Orchestrator: routes turns, generates responses, tracks costs."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from openai import OpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    Event,
    Message,
    Panel,
    PanelPersona,
    Persona,
    Session as SessionModel,
    Summary,
    TurnCost,
)
from app.services.event_hub import event_hub
from app.services.langgraph_flow import compiled_flow
from app.services.security import detect_argument_tag, sanitize_user_input

logger = logging.getLogger(__name__)
settings = get_settings()

# Cost per 1M tokens (USD) — approximate gpt-5.2 pricing, use gpt-4o-mini as proxy
_COST_PER_1M = {
    "prompt": 0.15,
    "completion": 0.60,
}


def _estimate_cost(prompt_tokens: int, completion_tokens: int) -> Decimal:
    cost = (
        prompt_tokens * _COST_PER_1M["prompt"]
        + completion_tokens * _COST_PER_1M["completion"]
    ) / 1_000_000
    return Decimal(str(round(cost, 6)))


def _build_system_prompt_from_schema(schema: dict) -> str:
    """Build a rich system prompt from the persona's schema_json."""
    name = schema.get("name", "Expert")
    identity = schema.get("identity", "")
    worldview = schema.get("worldview", "")
    style = schema.get("style", "professional")
    constraints = schema.get("safety_constraints", [])
    drift_policy = schema.get("drift_policy", {})
    reinforcement = drift_policy.get("reinforcement_prompt", "")

    parts = [f"You are {name}."]
    if identity:
        parts.append(identity)
    if worldview:
        parts.append(f"Your worldview: {worldview}")
    parts.append(f"Communication style: {style}")
    if constraints:
        parts.append("Safety constraints: " + "; ".join(constraints))
    if reinforcement:
        parts.append(reinforcement)
    parts.append(
        "Respond concisely and authentically in character. "
        "Stay in role. If another expert is mentioned, you may address them directly."
    )
    return " ".join(parts)


class OrchestratorService:
    def __init__(self) -> None:
        self._enabled = bool(settings.openai_api_key)
        self._client = OpenAI(api_key=settings.openai_api_key) if self._enabled else None

    def _generate(
        self, system_prompt: str, messages_history: list[dict], user_text: str
    ) -> tuple[str, int, int]:
        """Call OpenAI and return (text, prompt_tokens, completion_tokens)."""
        if not self._enabled or self._client is None:
            return (
                "[Simulated] I hear your question and will respond with a balanced argument from this persona.",
                0,
                0,
            )

        msgs = [{"role": "system", "content": system_prompt}]
        msgs.extend(messages_history)
        msgs.append({"role": "user", "content": user_text})

        response = self._client.chat.completions.create(
            model=settings.openai_model,
            messages=msgs,  # type: ignore[arg-type]
            temperature=0.8,
            max_completion_tokens=2048,
        )
        choice = response.choices[0]
        text = choice.message.content or "I need a moment to reformulate my response."
        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        return text, prompt_tokens, completion_tokens

    def _list_panel_persona_ids(self, db: Session, session_id: str) -> list[str]:
        session_row = db.get(SessionModel, session_id)
        if session_row is None:
            return []
        panel = db.get(Panel, session_row.panel_id)
        if panel is None:
            return []
        return [
            row.persona_id
            for row in db.scalars(
                select(PanelPersona).where(PanelPersona.panel_id == panel.id)
            )
        ]

    def _get_conversation_history(
        self, db: Session, session_id: str, limit: int = 12
    ) -> list[dict]:
        """Return last N messages as OpenAI-format chat history."""
        rows = list(
            db.scalars(
                select(Message)
                .where(Message.session_id == session_id)
                .order_by(Message.created_at.desc())
                .limit(limit)
            )
        )
        rows.reverse()
        history = []
        for msg in rows:
            role = "user" if msg.role == "user" else "assistant"
            # Prefix assistant messages with speaker name for context
            if role == "assistant":
                content = f"[{msg.author_id}]: {msg.content}"
            else:
                content = msg.content
            history.append({"role": role, "content": content})
        return history

    def _choose_next_speaker(
        self, db: Session, session_id: str, mention_persona_id: str | None, user_text: str
    ) -> str:
        persona_ids = self._list_panel_persona_ids(db, session_id)

        # Get turn counts from moderation_context
        session_row = db.get(SessionModel, session_id)
        turn_counts: dict[str, int] = {}
        if session_row and session_row.moderation_context:
            turn_counts = session_row.moderation_context.get("turn_counts", {})

        flow_state = compiled_flow.invoke(
            {
                "user_text": user_text,
                "mention_persona_id": mention_persona_id,
                "persona_ids": persona_ids,
                "chosen_speaker": "mediator",
                "moderation_status": "pending",
                "turn_counts": turn_counts,
            }
        )
        chosen = flow_state["chosen_speaker"]

        # Persist updated turn_counts back to session
        if session_row:
            ctx = dict(session_row.moderation_context or {})
            ctx["turn_counts"] = flow_state.get("turn_counts", turn_counts)
            session_row.moderation_context = ctx
            db.add(session_row)

        return chosen

    async def run_turn(
        self,
        db: Session,
        session_id: str,
        user_message: Message,
        mention_persona_id: str | None,
    ) -> Message:
        # Check cost ceiling before running
        session_row = db.get(SessionModel, session_id)
        if session_row and session_row.cost_ceiling_usd is not None:
            if session_row.cumulative_cost_usd >= session_row.cost_ceiling_usd:
                await event_hub.publish(
                    session_id,
                    "session.error",
                    {"message": "Session cost ceiling reached. No further turns allowed."},
                )
                raise RuntimeError("Cost ceiling exceeded")

        sanitized = sanitize_user_input(user_message.content)
        speaker_id = self._choose_next_speaker(
            db, session_id, mention_persona_id, sanitized
        )

        await event_hub.publish(
            session_id,
            "mediator.status",
            {"status": "evaluating", "speaker_candidate": speaker_id},
        )
        await event_hub.publish(
            session_id,
            "agent.status.changed",
            {"agent_id": speaker_id, "status": "thinking"},
        )

        # Fetch persona from DB and build system prompt
        persona_row = db.get(Persona, speaker_id)
        if persona_row and persona_row.schema_json:
            system_prompt = _build_system_prompt_from_schema(persona_row.schema_json)
        else:
            system_prompt = (
                f"You are {speaker_id}, an expert panelist. "
                "Respond concisely and insightfully in character."
            )

        # Fetch conversation history
        history = self._get_conversation_history(db, session_id)

        # Generate response
        response_text, prompt_tokens, completion_tokens = await asyncio.to_thread(
            self._generate, system_prompt, history, sanitized
        )

        # Cost tracking
        cost_usd = _estimate_cost(prompt_tokens, completion_tokens)
        model_name = settings.openai_model

        turn_cost = TurnCost(
            session_id=session_id,
            persona_id=speaker_id,
            model=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
        )
        db.add(turn_cost)

        # Update session cumulative cost
        if session_row:
            current = session_row.cumulative_cost_usd or Decimal("0")
            session_row.cumulative_cost_usd = current + cost_usd
            db.add(session_row)

        await event_hub.publish(
            session_id,
            "agent.status.changed",
            {"agent_id": speaker_id, "status": "typing"},
        )

        # Stream tokens word-by-word
        for token in response_text.split(" "):
            await event_hub.publish(
                session_id, "agent.token", {"agent_id": speaker_id, "token": token + " "}
            )
            await asyncio.sleep(0.02)

        reply = Message(
            id=str(uuid4()),
            session_id=session_id,
            role="assistant",
            author_id=speaker_id,
            content=response_text,
            argument_tag=detect_argument_tag(response_text),
            metadata_json={
                "speaker_id": speaker_id,
                "generated_at": datetime.utcnow().isoformat(),
                "cost_usd": float(cost_usd),
                "model": model_name,
            },
        )
        db.add(reply)

        event_row = Event(
            session_id=session_id,
            event_type="agent.message.completed",
            payload_json={"message_id": reply.id, "author_id": speaker_id},
        )
        db.add(event_row)

        # Summary generation every N messages
        message_count = db.query(Message).filter(Message.session_id == session_id).count()
        if message_count % settings.summary_every_n_messages == 0:
            version = (
                db.query(Summary).filter(Summary.session_id == session_id).count() + 1
            )
            all_messages = list(
                db.scalars(
                    select(Message)
                    .where(Message.session_id == session_id)
                    .order_by(Message.created_at.asc())
                )
            )
            summary_lines = [f"# Summary v{version}"]
            for msg in all_messages[-settings.max_working_memory_messages:]:
                summary_lines.append(
                    f"- **{msg.author_id}** ({msg.argument_tag}): {msg.content[:180]}"
                )
            summary = Summary(
                session_id=session_id,
                version=version,
                content_markdown="\n".join(summary_lines),
            )
            db.add(summary)
            await event_hub.publish(
                session_id,
                "memory.summary.updated",
                {"version": version, "content_markdown": summary.content_markdown},
            )

        db.commit()
        db.refresh(reply)

        await event_hub.publish(
            session_id,
            "agent.message.completed",
            {
                "id": reply.id,
                "session_id": reply.session_id,
                "role": reply.role,
                "author_id": reply.author_id,
                "content": reply.content,
                "argument_tag": reply.argument_tag,
                "reply_to": reply.reply_to,
                "created_at": reply.created_at.isoformat(),
                "metadata": reply.metadata_json,
            },
        )
        await event_hub.publish(
            session_id,
            "agent.status.changed",
            {"agent_id": speaker_id, "status": "idle"},
        )

        return reply


orchestrator = OrchestratorService()
