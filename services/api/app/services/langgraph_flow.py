"""LangGraph orchestration: LLM-based mediator routing using OpenAI SDK directly."""
from __future__ import annotations

import logging
import os
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from openai import OpenAI

logger = logging.getLogger(__name__)

MEDIATOR_SYSTEM = """You are an impartial moderator for a panel of experts. Your job is to:
1. Ensure roughly equal speaking time among panelists
2. Route the conversation to whoever would add most value next
3. Decide who speaks next based on the conversation flow and turn counts

When given the panelist list, turn counts, and user message, choose ONE panelist to respond.
Reply with ONLY their ID, nothing else. Example: "niels-bohr"

If the conversation seems complete, reply with "END".
"""


class FlowState(TypedDict):
    user_text: str
    mention_persona_id: str | None
    persona_ids: list[str]
    chosen_speaker: str
    moderation_status: str
    turn_counts: dict[str, int]


def _mediator_node(state: FlowState) -> dict[str, Any]:
    """LLM-based mediator decides who speaks next."""
    persona_ids = state["persona_ids"]
    mention = state.get("mention_persona_id")
    turn_counts = dict(state.get("turn_counts") or {})

    # Direct mention takes priority
    if mention and mention in persona_ids:
        return {
            **state,
            "chosen_speaker": mention,
            "moderation_status": "speaker_selected",
            "turn_counts": {**turn_counts, mention: turn_counts.get(mention, 0) + 1},
        }

    if not persona_ids:
        return {**state, "chosen_speaker": "mediator", "moderation_status": "no_panelists"}

    # Use LLM to choose the next speaker
    try:
        api_key = os.getenv("OPENAI_API_KEY", "")
        model = os.getenv("OPENAI_MODEL", "gpt-5.2")
        if api_key:
            client = OpenAI(api_key=api_key)
            panel_list = ", ".join(persona_ids)
            prompt = (
                f"Panelists: {panel_list}\n"
                f"Turn counts: {turn_counts}\n"
                f"User message: {state['user_text']}\n\n"
                "Who should respond next? Reply with only their ID or END."
            )
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": MEDIATOR_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_completion_tokens=20,
            )
            content = response.choices[0].message.content or ""
            content = content.strip()

            if "end" in content.lower():
                chosen = min(persona_ids, key=lambda pid: turn_counts.get(pid, 0))
            else:
                # Find which persona_id appears in the response
                matched = next((pid for pid in persona_ids if pid in content), None)
                chosen = matched or min(persona_ids, key=lambda pid: turn_counts.get(pid, 0))
        else:
            # No API key: round-robin
            chosen = min(persona_ids, key=lambda pid: turn_counts.get(pid, 0))

    except Exception as exc:
        logger.warning("Mediator LLM error, falling back to round-robin: %s", exc)
        chosen = min(persona_ids, key=lambda pid: turn_counts.get(pid, 0))

    return {
        **state,
        "chosen_speaker": chosen,
        "moderation_status": "speaker_selected",
        "turn_counts": {**turn_counts, chosen: turn_counts.get(chosen, 0) + 1},
    }


def _speaker_node(state: FlowState) -> dict[str, Any]:
    return {**state, "moderation_status": "ready_for_generation"}


def build_graph() -> Any:
    graph: StateGraph = StateGraph(FlowState)  # type: ignore[type-arg]
    graph.add_node("mediator", _mediator_node)
    graph.add_node("speaker", _speaker_node)
    graph.add_edge(START, "mediator")
    graph.add_edge("mediator", "speaker")
    graph.add_edge("speaker", END)
    return graph.compile()


compiled_flow = build_graph()
