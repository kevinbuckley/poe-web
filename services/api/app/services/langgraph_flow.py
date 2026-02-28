"""Mediator planning and mention parsing for panel-native orchestration."""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass

from openai import OpenAI

logger = logging.getLogger(__name__)

MENTION_PATTERN = re.compile(r"@([a-zA-Z0-9][a-zA-Z0-9_-]{1,63})")

MEDIATOR_SYSTEM = """You are the mediator of a live expert panel.
Your responsibilities:
1) Maximize informational gain, not equal round-robin airtime.
2) Keep discussion natural: direct rebuttals, strong viewpoints, concise moderation.
3) Prevent repetitive loops, long monologues, and duplicate consecutive speakers.
4) Ensure at least one cross-expert interaction before synthesis when possible.

Return ONLY valid JSON with keys:
- next_speaker_id: string|null
- continue_cycle: boolean
- reason: short string
- required_address_targets: string[]
"""


@dataclass
class MediatorPlan:
    next_speaker_id: str | None
    continue_cycle: bool
    reason: str
    required_address_targets: list[str]
    turn_mode: str = "adaptive_freeflow"
    scores: dict[str, float] | None = None


def extract_mentions(text: str) -> list[str]:
    """Parse @persona_id mentions from any role output."""
    return [m.group(1) for m in MENTION_PATTERN.finditer(text or "")]


def _score_candidates(
    persona_ids: list[str],
    turn_counts: dict[str, int],
    recent_speakers: list[str],
    required_targets: list[str],
    soft_targets: list[str],
    last_speaker: str | None,
    enforce_no_repeat: bool,
) -> dict[str, float]:
    scores: dict[str, float] = {}
    recent_tail = set(recent_speakers[-2:])
    for pid in persona_ids:
        relevance = 1.0
        disagreement_value = 0.9 if pid not in recent_tail else 0.2
        mention_boost = 0.0
        if pid in required_targets:
            mention_boost += 3.2
        elif pid in soft_targets:
            mention_boost += 1.7

        novelty = 1.2 / (1 + turn_counts.get(pid, 0))
        airtime_penalty = 0.55 * turn_counts.get(pid, 0)
        repetition_penalty = 0.0
        if enforce_no_repeat and last_speaker and pid == last_speaker and pid not in required_targets:
            repetition_penalty += 7.0

        score = relevance + disagreement_value + mention_boost + novelty - airtime_penalty - repetition_penalty
        scores[pid] = score
    return scores


def _heuristic_plan(
    *,
    user_text: str,
    persona_ids: list[str],
    turn_counts: dict[str, int],
    recent_speakers: list[str],
    hard_mention: str | None,
    soft_mentions: list[str],
    distinct_speakers: set[str],
    turn_index: int,
    min_turns: int,
    target_turns: int,
    max_turns: int,
    last_speaker: str | None,
) -> MediatorPlan:
    valid_soft = [pid for pid in soft_mentions if pid in persona_ids]
    if hard_mention and hard_mention in persona_ids:
        return MediatorPlan(
            next_speaker_id=hard_mention,
            continue_cycle=True,
            reason="explicit user mention",
            required_address_targets=[hard_mention],
            scores={hard_mention: 999.0},
        )

    if turn_index > max_turns:
        return MediatorPlan(
            next_speaker_id=None,
            continue_cycle=False,
            reason="maximum turn budget reached",
            required_address_targets=[],
        )

    min_distinct = min(len(persona_ids), 2)
    if turn_index >= target_turns and len(distinct_speakers) >= min_distinct and not valid_soft:
        return MediatorPlan(
            next_speaker_id=None,
            continue_cycle=False,
            reason="sufficient depth reached",
            required_address_targets=[],
        )

    enforce_no_repeat = turn_index > 1
    scores = _score_candidates(
        persona_ids=persona_ids,
        turn_counts=turn_counts,
        recent_speakers=recent_speakers,
        required_targets=valid_soft,
        soft_targets=valid_soft,
        last_speaker=last_speaker,
        enforce_no_repeat=enforce_no_repeat,
    )

    if len(distinct_speakers) < min_distinct:
        for pid in persona_ids:
            if pid not in distinct_speakers:
                scores[pid] = scores.get(pid, 0.0) + 1.25

    chosen = max(scores, key=scores.get) if scores else (persona_ids[0] if persona_ids else None)
    if not chosen:
        return MediatorPlan(
            next_speaker_id=None,
            continue_cycle=False,
            reason="no available speaker",
            required_address_targets=[],
        )

    reason = "addressed rebuttal" if chosen in valid_soft else "best next contribution"
    if turn_index < min_turns:
        reason = f"{reason} (minimum depth)"

    return MediatorPlan(
        next_speaker_id=chosen,
        continue_cycle=True,
        reason=reason,
        required_address_targets=valid_soft,
        scores=scores,
    )


def _llm_plan(
    *,
    user_text: str,
    persona_ids: list[str],
    turn_counts: dict[str, int],
    recent_speakers: list[str],
    hard_mention: str | None,
    soft_mentions: list[str],
    distinct_speakers: set[str],
    turn_index: int,
    min_turns: int,
    target_turns: int,
    max_turns: int,
) -> MediatorPlan | None:
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or not persona_ids:
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)
    payload = {
        "user_text": user_text,
        "panelists": persona_ids,
        "turn_counts": turn_counts,
        "recent_speakers": recent_speakers[-4:],
        "hard_mention": hard_mention,
        "soft_mentions": [m for m in soft_mentions if m in persona_ids],
        "turn_index": turn_index,
        "min_turns": min_turns,
        "target_turns": target_turns,
        "max_turns": max_turns,
        "distinct_speakers": sorted(distinct_speakers),
    }
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": MEDIATOR_SYSTEM},
            {"role": "user", "content": json.dumps(payload)},
        ],
        temperature=0.2,
        max_completion_tokens=220,
    )
    content = (response.choices[0].message.content or "").strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        data = json.loads(content)
    except Exception:
        return None

    next_speaker = data.get("next_speaker_id")
    if next_speaker is not None and next_speaker not in persona_ids:
        next_speaker = None
    required_targets = [
        pid for pid in data.get("required_address_targets", []) if isinstance(pid, str) and pid in persona_ids
    ]
    continue_cycle = bool(data.get("continue_cycle", True))
    if turn_index < min_turns:
        continue_cycle = True
    if turn_index > max_turns:
        continue_cycle = False
        next_speaker = None

    if continue_cycle and next_speaker is None and persona_ids:
        next_speaker = min(persona_ids, key=lambda pid: turn_counts.get(pid, 0))

    return MediatorPlan(
        next_speaker_id=next_speaker,
        continue_cycle=continue_cycle,
        reason=str(data.get("reason", "llm planner decision")),
        required_address_targets=required_targets,
    )


def plan_next_turn(
    *,
    user_text: str,
    persona_ids: list[str],
    turn_counts: dict[str, int],
    recent_speakers: list[str],
    hard_mention: str | None,
    soft_mentions: list[str],
    distinct_speakers: set[str],
    turn_index: int,
    min_turns: int,
    target_turns: int,
    max_turns: int,
    last_speaker: str | None,
) -> MediatorPlan:
    if not persona_ids:
        return MediatorPlan(
            next_speaker_id=None,
            continue_cycle=False,
            reason="no panelists configured",
            required_address_targets=[],
        )

    try:
        llm_plan = _llm_plan(
            user_text=user_text,
            persona_ids=persona_ids,
            turn_counts=turn_counts,
            recent_speakers=recent_speakers,
            hard_mention=hard_mention,
            soft_mentions=soft_mentions,
            distinct_speakers=distinct_speakers,
            turn_index=turn_index,
            min_turns=min_turns,
            target_turns=target_turns,
            max_turns=max_turns,
        )
        if llm_plan is not None:
            return llm_plan
    except Exception as exc:
        logger.warning("Mediator LLM planning failed, using heuristic planner: %s", exc)

    return _heuristic_plan(
        user_text=user_text,
        persona_ids=persona_ids,
        turn_counts=turn_counts,
        recent_speakers=recent_speakers,
        hard_mention=hard_mention,
        soft_mentions=soft_mentions,
        distinct_speakers=distinct_speakers,
        turn_index=turn_index,
        min_turns=min_turns,
        target_turns=target_turns,
        max_turns=max_turns,
        last_speaker=last_speaker,
    )
