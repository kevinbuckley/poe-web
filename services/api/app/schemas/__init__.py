from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class PersonaSchema(BaseModel):
    id: str
    name: str
    identity: str
    worldview: str
    style: str
    relational_biases: dict[str, str] = Field(default_factory=dict)
    safety_constraints: list[str] = Field(default_factory=list)
    knowledge_sources: list[str] = Field(default_factory=list)
    drift_policy: dict[str, Any] = Field(default_factory=lambda: {
        "threshold": 70,
        "reinforcement_prompt": "Stay consistent with your persona style and worldview.",
    })


class CreatePanelRequest(BaseModel):
    name: str
    persona_ids: list[str]
    mode: Literal["scatter_gather", "pipeline_parallel"] = "scatter_gather"


class PanelResponse(BaseModel):
    id: str
    name: str
    persona_ids: list[str]
    mode: str
    created_at: datetime


class CreateSessionRequest(BaseModel):
    panel_id: str


class SessionResponse(BaseModel):
    id: str
    panel_id: str
    status: str
    created_at: datetime


class PostMessageRequest(BaseModel):
    content: str
    mention_persona_id: str | None = None


class StartCycleResponse(BaseModel):
    cycle_id: str
    session_id: str
    user_message_id: str
    status: Literal["running"]


class ConversationMessageResponse(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant", "mediator", "system"]
    speaker_role: Literal["user", "expert", "mediator", "system"] = "expert"
    author_id: str
    content: str
    argument_tag: Literal["CLAIM", "SUPPORT", "REBUT", "OTHER"]
    cycle_id: str | None = None
    turn_index: int | None = None
    reply_to_message_id: str | None = None
    directed_to_persona_id: str | None = None
    mentioned_persona_ids: list[str] = Field(default_factory=list)
    reply_to: str | None = None  # legacy alias retained for storage compatibility
    created_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class InterruptRequest(BaseModel):
    reason: str


class SSEEvent(BaseModel):
    type: str
    session_id: str
    payload: dict[str, Any]
    ts: datetime


class SummaryResponse(BaseModel):
    session_id: str
    version: int
    content_markdown: str
