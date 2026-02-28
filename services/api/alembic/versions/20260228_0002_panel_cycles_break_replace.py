"""panel-native cycle schema

Revision ID: 20260228_0002
Revises: 20260227_0001
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260228_0002"
down_revision = "20260227_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversation_cycles",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("session_id", sa.String(length=64), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_message_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="running"),
        sa.Column("turn_budget", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("turns_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )

    op.add_column("messages", sa.Column("cycle_id", sa.String(length=64), nullable=True))
    op.add_column("messages", sa.Column("turn_index", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("reply_to_message_id", sa.String(length=64), nullable=True))
    op.add_column("messages", sa.Column("directed_to_persona_id", sa.String(length=64), nullable=True))
    op.add_column(
        "messages",
        sa.Column(
            "mentioned_persona_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "messages",
        sa.Column("speaker_role", sa.String(length=20), nullable=False, server_default="expert"),
    )

    op.create_foreign_key(
        "fk_messages_cycle_id_conversation_cycles",
        "messages",
        "conversation_cycles",
        ["cycle_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_messages_cycle_id", "messages", ["cycle_id"])


def downgrade() -> None:
    op.drop_index("ix_messages_cycle_id", table_name="messages")
    op.drop_constraint("fk_messages_cycle_id_conversation_cycles", "messages", type_="foreignkey")

    op.drop_column("messages", "speaker_role")
    op.drop_column("messages", "mentioned_persona_ids")
    op.drop_column("messages", "directed_to_persona_id")
    op.drop_column("messages", "reply_to_message_id")
    op.drop_column("messages", "turn_index")
    op.drop_column("messages", "cycle_id")

    op.drop_table("conversation_cycles")
