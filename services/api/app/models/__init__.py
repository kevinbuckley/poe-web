from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> str:
    return str(uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    org_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Persona(Base):
    __tablename__ = "personas"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    schema_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    legal_flags: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    cost_cap_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Panel(Base):
    __tablename__ = "panels"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    mode: Mapped[str] = mapped_column(String(40))
    created_by: Mapped[str] = mapped_column(String(64), default="demo-user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    personas: Mapped[list["PanelPersona"]] = relationship("PanelPersona", back_populates="panel")


class PanelPersona(Base):
    __tablename__ = "panel_personas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    panel_id: Mapped[str] = mapped_column(ForeignKey("panels.id", ondelete="CASCADE"))
    persona_id: Mapped[str] = mapped_column(ForeignKey("personas.id", ondelete="CASCADE"))

    panel: Mapped[Panel] = relationship("Panel", back_populates="personas")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    panel_id: Mapped[str] = mapped_column(ForeignKey("panels.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(40), default="active")
    moderation_context: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    memory_envelope: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    cost_ceiling_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    cumulative_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"), server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20))
    author_id: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text)
    argument_tag: Mapped[str] = mapped_column(String(20), default="OTHER")
    reply_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(80))
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Summary(Base):
    __tablename__ = "summaries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    content_markdown: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ModerationAction(Base):
    __tablename__ = "moderation_actions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    action_type: Mapped[str] = mapped_column(String(80))
    details_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DriftEvaluation(Base):
    __tablename__ = "drift_evaluations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    persona_id: Mapped[str] = mapped_column(String(64))
    score: Mapped[int] = mapped_column(Integer)
    reinforcement_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    reinforcement_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TurnCost(Base):
    __tablename__ = "turn_costs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    turn_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    persona_id: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(80))
    prompt_tokens: Mapped[int] = mapped_column(Integer)
    completion_tokens: Mapped[int] = mapped_column(Integer)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 6))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
