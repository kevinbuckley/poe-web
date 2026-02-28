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
  speaker_role: "user" | "expert" | "mediator" | "system";
  author_id: string;
  content: string;
  argument_tag: ArgumentTag;
  cycle_id?: string | null;
  turn_index?: number | null;
  reply_to_message_id?: string | null;
  directed_to_persona_id?: string | null;
  mentioned_persona_ids?: string[];
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
    | "cycle.started"
    | "mediator.plan.updated"
    | "turn.started"
    | "agent.token"
    | "turn.completed"
    | "turn.interrupted"
    | "cycle.synthesis.completed"
    | "cycle.completed"
    | "session.error";
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

export interface StartCycleResponse {
  cycle_id: string;
  session_id: string;
  user_message_id: string;
  status: "running";
}

export interface InterruptRequest {
  reason: string;
}

export interface VoiceSuggestion {
  label: string;
  origin: string;
  voice: string;
}

export interface SuggestVoiceRequest {
  topic: string;
  experts: { name: string; voice: string }[];
  slot_index: number;
}

export interface SuggestVoiceResponse {
  suggestions: VoiceSuggestion[];
}

export interface SuggestPanelRequest {
  topic: string;
}

export interface SuggestPanelResponse {
  suggested_persona_ids: string[];
  suggested_name: string;
  rationale: string;
}

export interface PresetPanel {
  key: string;
  name: string;
  description: string;
  persona_ids: string[];
  emoji: string;
}
