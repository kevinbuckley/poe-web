"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationMessage, PersonaSchema, SSEEvent } from "@poe/contracts";
import { SectionCard } from "@poe/ui";
import { ChatInput } from "../components/chat-input";
import { Thread } from "../components/thread";
import {
  createPanel,
  createSession,
  getSseUrl,
  listPersonas,
  postMessage,
  seedPersonas,
} from "../lib/api";

type StreamingMessage = {
  id: string;
  author_id: string;
  content: string;
  argument_tag: "CLAIM" | "SUPPORT" | "REBUT" | "OTHER";
};

type AgentStatusPayload = {
  agent_id: string;
  status: "idle" | "thinking" | "typing" | "interrupted" | "error";
};

type MediatorStatusPayload = {
  status: string;
  speaker_candidate?: string;
};

type AgentTokenPayload = {
  agent_id: string;
  token: string;
};

export default function HomePage() {
  const [panelId, setPanelId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [mediatorStatus, setMediatorStatus] = useState<string>("idle");
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatusPayload["status"]>>({});
  const [personas, setPersonas] = useState<PersonaSchema[]>([]);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [panelName, setPanelName] = useState("Expert Panel");
  const [panelMode, setPanelMode] = useState<"scatter_gather" | "pipeline_parallel">("scatter_gather");
  const [personasLoading, setPersonasLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const subtitle = useMemo(() => {
    if (sessionId) return `Session: ${sessionId.slice(0, 8)}…`;
    if (panelId) return `Panel: ${panelId.slice(0, 8)}…`;
    return "No active session — select personas and create a panel";
  }, [panelId, sessionId]);

  // Load personas on mount; seed if empty
  useEffect(() => {
    setPersonasLoading(true);
    listPersonas()
      .then(async (list) => {
        if (list.length === 0) {
          const seeded = await seedPersonas();
          setPersonas(seeded);
        } else {
          setPersonas(list);
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setPersonasLoading(false));
  }, []);

  function togglePersona(id: string) {
    setSelectedPersonaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 8 ? [...prev, id] : prev
    );
  }

  async function startSessionIfNeeded(nextPanelId: string) {
    const session = await createSession({ panel_id: nextPanelId });
    setSessionId(session.id);
    setMediatorStatus("session.started");
    setAgentStatuses({});
    setStreamingMessage(null);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(getSseUrl(session.id));
    es.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as SSEEvent;
      if (parsed.type === "session.started") {
        setMediatorStatus("session.started");
        return;
      }
      if (parsed.type === "mediator.status") {
        const payload = parsed.payload as MediatorStatusPayload;
        setMediatorStatus(
          payload.speaker_candidate
            ? `${payload.status} → ${payload.speaker_candidate}`
            : payload.status
        );
        return;
      }
      if (parsed.type === "agent.status.changed") {
        const payload = parsed.payload as AgentStatusPayload;
        setAgentStatuses((prev) => {
          const next = { ...prev };
          if (payload.status === "idle") {
            delete next[payload.agent_id];
          } else {
            next[payload.agent_id] = payload.status;
          }
          return next;
        });
        if (payload.status === "idle") {
          setBusy(false);
        }
        return;
      }
      if (parsed.type === "agent.token") {
        const payload = parsed.payload as AgentTokenPayload;
        setStreamingMessage((prev) => {
          if (!prev || prev.author_id !== payload.agent_id) {
            return {
              id: `stream-${payload.agent_id}`,
              author_id: payload.agent_id,
              content: payload.token,
              argument_tag: "OTHER",
            };
          }
          return { ...prev, content: prev.content + payload.token };
        });
        return;
      }
      if (parsed.type === "agent.message.completed") {
        const payload = parsed.payload as ConversationMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.id)) return prev;
          return [...prev, payload];
        });
        setStreamingMessage((prev) =>
          prev && prev.author_id === payload.author_id ? null : prev
        );
        setBusy(false);
        return;
      }
      if (parsed.type === "session.error") {
        setError(JSON.stringify(parsed.payload));
        setBusy(false);
      }
    };
    es.onerror = () => {
      setMediatorStatus("connection error — retrying…");
    };
    eventSourceRef.current = es;
  }

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  async function handleCreatePanel() {
    if (selectedPersonaIds.length === 0) {
      setError("Select at least one persona.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const panel = await createPanel({
        name: panelName,
        persona_ids: selectedPersonaIds,
        mode: panelMode,
      });
      setPanelId(panel.id);
      setMessages([]);
      await startSessionIfNeeded(panel.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(text: string) {
    if (!sessionId || busy) return;
    const mention = text.startsWith("@") ? text.split(" ")[0].slice(1) : undefined;

    const optimistic: ConversationMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: "user",
      author_id: "You",
      content: text,
      argument_tag: "CLAIM",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setBusy(true);
    try {
      await postMessage(sessionId, { content: text, mention_persona_id: mention });
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  function statusClassName(status: AgentStatusPayload["status"]) {
    if (status === "typing") return "status-chip status-typing";
    if (status === "thinking") return "status-chip status-thinking";
    if (status === "error") return "status-chip status-error";
    return "status-chip";
  }

  return (
    <main data-testid="main" className="poe-shell">
      <div className="poe-hero">
        <div className="poe-hero-content">
          <span className="poe-kicker">Live Deliberation Studio</span>
          <h1 className="poe-title">POE Platform</h1>
          <p data-testid="subtitle" className="poe-subtitle">
            {subtitle}
          </p>
        </div>
      </div>

      {error && (
        <div data-testid="error-banner" className="poe-error">
          <span>{error}</span>
          <button className="poe-error-dismiss" onClick={() => setError(null)} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      <div className="poe-grid">
        {/* Left: Panel Config */}
        <SectionCard title="Panel Configuration">
          <div className="config-grid">
            <div className="config-field">
              <label className="config-label">Panel Name</label>
              <input
                data-testid="panel-name-input"
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                placeholder="Panel name"
                className="config-input"
              />
            </div>

            <div className="config-field">
              <label className="config-label">Mode</label>
              <select
                data-testid="panel-mode-select"
                value={panelMode}
                onChange={(e) => setPanelMode(e.target.value as "scatter_gather" | "pipeline_parallel")}
                className="config-select"
              >
                <option value="scatter_gather">Scatter Gather</option>
                <option value="pipeline_parallel">Pipeline Parallel</option>
              </select>
            </div>

            <div className="config-field">
              <label className="config-label">Personas ({selectedPersonaIds.length}/8 selected)</label>
              {personasLoading ? (
                <p className="hint-line">Loading personas…</p>
              ) : (
                <div data-testid="persona-list" className="persona-list">
                  {personas.map((p) => (
                    <label
                      key={p.id}
                      data-testid="persona-item"
                      className={`persona-option${selectedPersonaIds.includes(p.id) ? " selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPersonaIds.includes(p.id)}
                        onChange={() => togglePersona(p.id)}
                        data-persona-id={p.id}
                      />
                      <div>
                        <div className="persona-name">{p.name}</div>
                        <div className="persona-style">{p.style}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              data-testid="create-panel-btn"
              disabled={busy || selectedPersonaIds.length === 0 || personasLoading}
              onClick={handleCreatePanel}
              className="create-button"
            >
              {busy && !sessionId ? "Creating…" : sessionId ? "New Panel" : "Create Panel"}
            </button>
          </div>
        </SectionCard>

        {/* Right: Conversation */}
        <SectionCard title="Threaded Discussion">
          <div data-testid="live-status" className="status-region">
            <p data-testid="mediator-status" className="status-label">
              Mediator: {mediatorStatus}
            </p>
            <div data-testid="agent-statuses" className="status-chips">
              {Object.entries(agentStatuses).length === 0 ? (
                <span data-testid="agent-status-empty" className="status-chip">
                  No active speakers
                </span>
              ) : (
                Object.entries(agentStatuses).map(([agentId, status]) => (
                  <span
                    key={agentId}
                    data-testid="agent-status"
                    data-agent-id={agentId}
                    data-status={status}
                    className={statusClassName(status)}
                  >
                    {agentId}: {status}
                  </span>
                ))
              )}
            </div>
          </div>

          <Thread messages={messages} streamingMessage={streamingMessage} />

          {!sessionId && (
            <p data-testid="no-session-hint" className="no-session-hint">
              Select personas on the left and click "Create Panel" to start.
            </p>
          )}

          <ChatInput disabled={!sessionId || busy} onSend={handleSend} />
        </SectionCard>
      </div>
    </main>
  );
}
