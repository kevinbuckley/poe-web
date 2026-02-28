"""Panel-native orchestrator: multi-turn expert cycles with mediator planning."""
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
    ConversationCycle,
    Event,
    Message,
    ModerationAction,
    Panel,
    PanelPersona,
    Persona,
    Session as SessionModel,
    Summary,
    TurnCost,
)
from app.services.event_hub import event_hub
from app.services.langgraph_flow import extract_mentions, plan_next_turn
from app.services.security import detect_argument_tag, sanitize_user_input

logger = logging.getLogger(__name__)
settings = get_settings()

# Approximate pricing used for on-platform guardrails.
_COST_PER_1M = {
    "prompt": 0.15,
    "completion": 0.60,
}

_MIN_TURNS = 2
_TARGET_TURNS = 3
_MAX_TURNS = 5


def _estimate_cost(prompt_tokens: int, completion_tokens: int) -> Decimal:
    cost = (
        prompt_tokens * _COST_PER_1M["prompt"]
        + completion_tokens * _COST_PER_1M["completion"]
    ) / 1_000_000
    return Decimal(str(round(cost, 6)))


def _build_expert_prompt_from_schema(schema: dict, panelist_ids: list[str]) -> str:
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
        "Panel behavior rules: state your stance clearly; challenge weak claims when needed; "
        "address peers directly using @persona_id when rebutting or building on their point; "
        "keep tone measured and professional; "
        "use @user to pose a direct question to the human when their input or clarification is essential; "
        "avoid routine questions — only ask when critical information is genuinely missing."
    )
    if panelist_ids:
        parts.append("Peer panelist IDs (address them by @id when engaging their argument): " + ", ".join(panelist_ids))
    return " ".join(parts)


def _build_mediator_synthesis_prompt(panelist_names: dict[str, str] | None = None) -> str:
    name_hint = ""
    if panelist_names:
        name_hint = (
            " Refer to each expert by their first name (not their ID) when attributing a point."
            " Name mapping: " + "; ".join(f"{pid} = {name}" for pid, name in panelist_names.items()) + "."
        )
    return (
        "You are the panel mediator. Produce a concise synthesis in 2-4 sentences. "
        "Highlight where panelists agreed, where they diverged, and surface the sharpest unresolved tension. "
        f"Name experts by first name when attributing their specific argument.{name_hint} "
        "If the panel needs more context from the human, end with a direct question prefixed with @user."
    )


class OrchestratorService:
    def __init__(self) -> None:
        self._enabled = bool(settings.openai_api_key)
        self._client = OpenAI(api_key=settings.openai_api_key) if self._enabled else None

    def _generate(
        self,
        system_prompt: str,
        messages_history: list[dict],
        user_text: str,
        *,
        temperature: float = 0.7,
        max_completion_tokens: int = 1024,
    ) -> tuple[str, int, int]:
        if not self._enabled or self._client is None:
            return (
                "[Simulated] I disagree with parts of the prior argument; @peer please defend your premise while I stress-test the assumptions.",
                0,
                0,
            )

        msgs = [{"role": "system", "content": system_prompt}]
        msgs.extend(messages_history)
        msgs.append({"role": "user", "content": user_text})

        response = self._client.chat.completions.create(
            model=settings.openai_model,
            messages=msgs,  # type: ignore[arg-type]
            temperature=temperature,
            max_completion_tokens=max_completion_tokens,
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
        self, db: Session, session_id: str, limit: int = 18
    ) -> list[dict]:
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
            if role == "assistant":
                content = f"[{msg.author_id}/{msg.speaker_role}]: {msg.content}"
            else:
                content = msg.content
            history.append({"role": role, "content": content})
        return history

    def _get_cycle_messages(self, db: Session, cycle_id: str) -> list[Message]:
        return list(
            db.scalars(
                select(Message)
                .where(Message.cycle_id == cycle_id)
                .order_by(Message.created_at.asc())
            )
        )

    def _serialize_message(self, msg: Message) -> dict:
        return {
            "id": msg.id,
            "session_id": msg.session_id,
            "role": msg.role,
            "speaker_role": msg.speaker_role,
            "author_id": msg.author_id,
            "content": msg.content,
            "argument_tag": msg.argument_tag,
            "cycle_id": msg.cycle_id,
            "turn_index": msg.turn_index,
            "reply_to_message_id": msg.reply_to_message_id,
            "directed_to_persona_id": msg.directed_to_persona_id,
            "mentioned_persona_ids": msg.mentioned_persona_ids or [],
            "reply_to": msg.reply_to,
            "created_at": msg.created_at.isoformat(),
            "metadata": msg.metadata_json,
        }

    def _record_turn_cost(
        self,
        db: Session,
        *,
        session_id: str,
        turn_id: str,
        persona_id: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> Decimal:
        cost_usd = _estimate_cost(prompt_tokens, completion_tokens)
        row = TurnCost(
            session_id=session_id,
            turn_id=turn_id,
            persona_id=persona_id,
            model=settings.openai_model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
        )
        db.add(row)
        return cost_usd

    def _apply_session_cost(self, session_row: SessionModel, delta: Decimal) -> None:
        current = session_row.cumulative_cost_usd or Decimal("0")
        session_row.cumulative_cost_usd = current + delta

    def _select_reply_target(
        self,
        cycle_messages: list[Message],
        required_targets: list[str],
    ) -> str | None:
        if not cycle_messages:
            return None

        if required_targets:
            for msg in reversed(cycle_messages):
                if msg.author_id in required_targets:
                    return msg.id
        return cycle_messages[-1].id

    def _update_summary(self, db: Session, session_id: str) -> None:
        message_count = db.query(Message).filter(Message.session_id == session_id).count()
        if message_count % settings.summary_every_n_messages != 0:
            return

        version = db.query(Summary).filter(Summary.session_id == session_id).count() + 1
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

    async def run_cycle(
        self,
        db: Session,
        session_id: str,
        cycle_id: str,
        user_message: Message,
        mention_persona_id: str | None,
    ) -> Message | None:
        session_row = db.get(SessionModel, session_id)
        if session_row is None:
            raise RuntimeError(f"Session {session_id} missing")

        cycle_row = db.get(ConversationCycle, cycle_id)
        if cycle_row is None:
            raise RuntimeError(f"Cycle {cycle_id} missing")

        if session_row.cost_ceiling_usd is not None and session_row.cumulative_cost_usd >= session_row.cost_ceiling_usd:
            await event_hub.publish(
                session_id,
                "session.error",
                {"cycle_id": cycle_id, "message": "Session cost ceiling reached. No further cycles allowed."},
            )
            cycle_row.status = "errored"
            cycle_row.completed_at = datetime.utcnow()
            db.add(cycle_row)
            db.commit()
            return None

        panel_persona_ids = self._list_panel_persona_ids(db, session_id)
        # Build id→name map for synthesis prompts (graceful fallback to id)
        panelist_names: dict[str, str] = {}
        for pid in panel_persona_ids:
            row = db.get(Persona, pid)
            if row and row.schema_json:
                panelist_names[pid] = row.schema_json.get("name", pid)
            else:
                panelist_names[pid] = pid

        if not panel_persona_ids:
            await event_hub.publish(
                session_id,
                "session.error",
                {"cycle_id": cycle_id, "message": "No panelists configured for this session."},
            )
            cycle_row.status = "errored"
            cycle_row.completed_at = datetime.utcnow()
            db.add(cycle_row)
            db.commit()
            return None

        sanitized_user_text = sanitize_user_input(user_message.content)
        parsed_user_mentions = [m for m in extract_mentions(sanitized_user_text) if m in panel_persona_ids]
        hard_mention = mention_persona_id if mention_persona_id in panel_persona_ids else None
        if hard_mention is None and parsed_user_mentions:
            hard_mention = parsed_user_mentions[0]

        await event_hub.publish(
            session_id,
            "cycle.started",
            {
                "cycle_id": cycle_id,
                "session_id": session_id,
                "user_message_id": user_message.id,
                "turn_budget": _TARGET_TURNS,
            },
        )

        turn_counts = dict((session_row.moderation_context or {}).get("turn_counts", {}))
        recent_speakers = list((session_row.moderation_context or {}).get("recent_speakers", []))
        distinct_speakers: set[str] = set()
        last_speaker: str | None = None
        soft_mentions: list[str] = []
        turns_used = 0

        mediator_message: Message | None = None

        try:
            for turn_index in range(1, _MAX_TURNS + 1):
                plan = plan_next_turn(
                    user_text=sanitized_user_text,
                    persona_ids=panel_persona_ids,
                    turn_counts=turn_counts,
                    recent_speakers=recent_speakers,
                    hard_mention=hard_mention if turn_index == 1 else None,
                    soft_mentions=soft_mentions,
                    distinct_speakers=distinct_speakers,
                    turn_index=turn_index,
                    min_turns=_MIN_TURNS,
                    target_turns=_TARGET_TURNS,
                    max_turns=_MAX_TURNS,
                    last_speaker=last_speaker,
                )

                await event_hub.publish(
                    session_id,
                    "mediator.plan.updated",
                    {
                        "cycle_id": cycle_id,
                        "turn_index": turn_index,
                        "next_speaker_id": plan.next_speaker_id,
                        "reason": plan.reason,
                        "required_address_targets": plan.required_address_targets,
                        "turn_mode": plan.turn_mode,
                        "continue_cycle": plan.continue_cycle,
                    },
                )

                db.add(
                    ModerationAction(
                        session_id=session_id,
                        action_type="mediator.plan",
                        details_json={
                            "cycle_id": cycle_id,
                            "turn_index": turn_index,
                            "next_speaker_id": plan.next_speaker_id,
                            "reason": plan.reason,
                            "continue_cycle": plan.continue_cycle,
                            "required_address_targets": plan.required_address_targets,
                        },
                    )
                )

                if not plan.continue_cycle or not plan.next_speaker_id:
                    break

                speaker_id = plan.next_speaker_id
                await event_hub.publish(
                    session_id,
                    "turn.started",
                    {
                        "cycle_id": cycle_id,
                        "turn_index": turn_index,
                        "speaker_id": speaker_id,
                        "required_address_targets": plan.required_address_targets,
                        "reason": plan.reason,
                    },
                )

                persona_row = db.get(Persona, speaker_id)
                if persona_row and persona_row.schema_json:
                    system_prompt = _build_expert_prompt_from_schema(persona_row.schema_json, panel_persona_ids)
                else:
                    system_prompt = (
                        f"You are {speaker_id}, an expert panelist. "
                        "Take a clear position, engage peers directly, and keep responses concise."
                    )

                history = self._get_conversation_history(db, session_id)

                # Build directive: include what peers already said in THIS cycle so
                # each expert must engage with their colleagues rather than independently re-answer.
                directive = sanitized_user_text
                cycle_so_far = [
                    m for m in self._get_cycle_messages(db, cycle_id)
                    if m.speaker_role == "expert" and m.author_id != speaker_id
                ]
                if cycle_so_far:
                    peer_lines = "\n\n".join(
                        f"@{m.author_id}: {m.content[:500]}"
                        for m in cycle_so_far
                    )
                    directive += (
                        "\n\n---\nYour fellow panelists have already responded. "
                        "Do NOT repeat or summarise what they said. "
                        "Instead, directly engage: agree with specific reasons, rebut with evidence, "
                        "or add a genuinely distinct angle they missed. "
                        "Reference them by @id when responding to their argument:\n\n"
                        + peer_lines
                        + "\n---"
                    )
                if plan.required_address_targets:
                    directive += (
                        "\n\nMake sure to address: "
                        + ", ".join(f"@{pid}" for pid in plan.required_address_targets)
                    )
                directive += "\n\nWrite 4-8 sentences. Include one concrete claim and one direct engagement with a peer's argument."

                response_text, prompt_tokens, completion_tokens = await asyncio.to_thread(
                    self._generate,
                    system_prompt,
                    history,
                    directive,
                    temperature=0.78,
                    max_completion_tokens=1400,
                )

                for token in response_text.split(" "):
                    await event_hub.publish(
                        session_id,
                        "agent.token",
                        {
                            "cycle_id": cycle_id,
                            "turn_index": turn_index,
                            "agent_id": speaker_id,
                            "token": token + " ",
                        },
                    )
                    await asyncio.sleep(0.015)

                mentions = [pid for pid in extract_mentions(response_text) if pid in panel_persona_ids and pid != speaker_id]
                cycle_messages = self._get_cycle_messages(db, cycle_id)
                reply_to_id = self._select_reply_target(cycle_messages, plan.required_address_targets)
                directed_to = mentions[0] if mentions else (plan.required_address_targets[0] if plan.required_address_targets else None)

                reply = Message(
                    id=str(uuid4()),
                    session_id=session_id,
                    role="assistant",
                    speaker_role="expert",
                    author_id=speaker_id,
                    content=response_text,
                    argument_tag=detect_argument_tag(response_text),
                    cycle_id=cycle_id,
                    turn_index=turn_index,
                    reply_to_message_id=reply_to_id,
                    directed_to_persona_id=directed_to,
                    mentioned_persona_ids=mentions,
                    reply_to=reply_to_id,
                    metadata_json={
                        "cycle_id": cycle_id,
                        "speaker_id": speaker_id,
                        "generated_at": datetime.utcnow().isoformat(),
                        "mediator_reason": plan.reason,
                    },
                )
                db.add(reply)
                db.flush()

                cost_usd = self._record_turn_cost(
                    db,
                    session_id=session_id,
                    turn_id=reply.id,
                    persona_id=speaker_id,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
                self._apply_session_cost(session_row, cost_usd)

                db.add(
                    Event(
                        session_id=session_id,
                        event_type="turn.completed",
                        payload_json={
                            "cycle_id": cycle_id,
                            "turn_index": turn_index,
                            "message_id": reply.id,
                            "speaker_id": speaker_id,
                        },
                    )
                )

                turn_counts[speaker_id] = turn_counts.get(speaker_id, 0) + 1
                recent_speakers.append(speaker_id)
                recent_speakers = recent_speakers[-12:]
                distinct_speakers.add(speaker_id)
                last_speaker = speaker_id
                soft_mentions = mentions
                turns_used += 1

                await event_hub.publish(
                    session_id,
                    "turn.completed",
                    {
                        "cycle_id": cycle_id,
                        "turn_index": turn_index,
                        "speaker_id": speaker_id,
                        "message": self._serialize_message(reply),
                    },
                )

                if session_row.cost_ceiling_usd is not None and session_row.cumulative_cost_usd >= session_row.cost_ceiling_usd:
                    await event_hub.publish(
                        session_id,
                        "session.error",
                        {
                            "cycle_id": cycle_id,
                            "message": "Session cost ceiling reached during cycle. Ending after synthesis.",
                        },
                    )
                    break

                db.add(session_row)
                db.commit()

            transcript = self._get_cycle_messages(db, cycle_id)
            synthesis_history = self._get_conversation_history(db, session_id, limit=22)
            synthesis_input = sanitized_user_text
            if transcript:
                recent = "\n".join(f"- {m.author_id}: {m.content[:220]}" for m in transcript[-6:])
                synthesis_input += "\n\nRecent cycle transcript:\n" + recent

            synthesis_text, prompt_tokens, completion_tokens = await asyncio.to_thread(
                self._generate,
                _build_mediator_synthesis_prompt(panelist_names),
                synthesis_history,
                synthesis_input,
                temperature=0.35,
                max_completion_tokens=420,
            )

            mediator_message = Message(
                id=str(uuid4()),
                session_id=session_id,
                role="mediator",
                speaker_role="mediator",
                author_id="mediator",
                content=synthesis_text,
                argument_tag="OTHER",
                cycle_id=cycle_id,
                turn_index=turns_used + 1,
                reply_to_message_id=(transcript[-1].id if transcript else user_message.id),
                directed_to_persona_id=None,
                mentioned_persona_ids=[pid for pid in extract_mentions(synthesis_text) if pid in panel_persona_ids],
                reply_to=(transcript[-1].id if transcript else user_message.id),
                metadata_json={
                    "cycle_id": cycle_id,
                    "generated_at": datetime.utcnow().isoformat(),
                    "kind": "mediator_synthesis",
                },
            )
            db.add(mediator_message)
            db.flush()

            synthesis_cost = self._record_turn_cost(
                db,
                session_id=session_id,
                turn_id=mediator_message.id,
                persona_id="mediator",
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
            self._apply_session_cost(session_row, synthesis_cost)

            await event_hub.publish(
                session_id,
                "cycle.synthesis.completed",
                {
                    "cycle_id": cycle_id,
                    "message": self._serialize_message(mediator_message),
                },
            )

            cycle_row.turns_used = turns_used
            cycle_row.status = "completed"
            cycle_row.completed_at = datetime.utcnow()
            db.add(cycle_row)

            context = dict(session_row.moderation_context or {})
            context["turn_counts"] = turn_counts
            context["recent_speakers"] = recent_speakers
            context["cooldowns"] = {pid: 1 for pid in recent_speakers[-1:]}
            context["topic_focus"] = sanitized_user_text[:180]
            context["unresolved_points"] = soft_mentions
            session_row.moderation_context = context
            db.add(session_row)

            db.add(
                Event(
                    session_id=session_id,
                    event_type="cycle.completed",
                    payload_json={
                        "cycle_id": cycle_id,
                        "turns_used": turns_used,
                        "distinct_speakers": sorted(distinct_speakers),
                    },
                )
            )

            self._update_summary(db, session_id)
            db.commit()
            db.refresh(mediator_message)

            await event_hub.publish(
                session_id,
                "cycle.completed",
                {
                    "cycle_id": cycle_id,
                    "status": "completed",
                    "turns_used": turns_used,
                    "distinct_speakers": sorted(distinct_speakers),
                },
            )
            return mediator_message

        except Exception:
            logger.exception("run_cycle failed")
            cycle_row.status = "errored"
            cycle_row.completed_at = datetime.utcnow()
            db.add(cycle_row)
            db.commit()
            await event_hub.publish(
                session_id,
                "session.error",
                {"cycle_id": cycle_id, "message": "Cycle execution failed."},
            )
            return None


orchestrator = OrchestratorService()
