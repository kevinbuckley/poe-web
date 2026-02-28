export type ArgumentTag = "CLAIM" | "SUPPORT" | "REBUT" | "OTHER";

export type AgentStatus = "idle" | "thinking" | "typing" | "interrupted" | "error";

export interface PersonaSchema {
  id: string;
  name: string;
  identity: string;
  worldview: string;
  style: string;
  relational_biases: Record<string, string>;
  safety_constraints: string[];
  knowledge_sources: string[];
  drift_policy: {
    threshold: number;
    reinforcement_prompt: string;
  };
}

export interface ConversationMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "mediator" | "system";
  author_id: string;
  content: string;
  argument_tag: ArgumentTag;
  reply_to?: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface ModerationContext {
  speaking_time_seconds: Record<string, number>;
  interrupt_budget: Record<string, number>;
  topic_focus: string;
  policy_flags: string[];
}

export interface MemoryEnvelope {
  working_window: string[];
  episodic_refs: string[];
  semantic_refs: string[];
  summary_version: number;
}

export interface SessionState {
  id: string;
  panel_id: string;
  active_panelists: string[];
  moderation_context: ModerationContext;
  memory: MemoryEnvelope;
}

export interface Panel {
  id: string;
  name: string;
  persona_ids: string[];
  mode: "scatter_gather" | "pipeline_parallel";
  created_at: string;
}

export interface Session {
  id: string;
  panel_id: string;
  status: "active" | "completed" | "errored";
  created_at: string;
}

export interface SSEEvent<T = unknown> {
  type:
    | "session.started"
    | "mediator.status"
    | "agent.status.changed"
    | "agent.token"
    | "agent.message.completed"
    | "agent.interrupt.triggered"
    | "memory.summary.updated"
    | "session.error"
    | "session.completed";
  session_id: string;
  payload: T;
  ts: string;
}

export interface CreatePanelRequest {
  name: string;
  persona_ids: string[];
  mode: "scatter_gather" | "pipeline_parallel";
}

export interface CreateSessionRequest {
  panel_id: string;
}

export interface PostMessageRequest {
  content: string;
  mention_persona_id?: string;
}

export interface InterruptRequest {
  reason: string;
}
