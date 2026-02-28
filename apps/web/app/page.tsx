"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationMessage, PersonaSchema, SSEEvent } from "@poe/contracts";
import { SectionCard } from "@poe/ui";
import { ChatInput } from "../components/chat-input";
import { CustomPanelBuilder } from "../components/CustomPanelBuilder";
import { Thread } from "../components/thread";
import {
  createPanel,
  createSession,
  getSseUrl,
  listPersonas,
  postMessage,
  seedPersonas,
} from "../lib/api";

type PanelMode = "scatter_gather" | "pipeline_parallel";

const MODE_OPTIONS: Array<{
  value: PanelMode;
  label: string;
  description: string;
}> = [
  {
    value: "scatter_gather",
    label: "Independent Roundtable",
    description: "Each expert responds to your prompt directly, then the mediator synthesizes.",
  },
  {
    value: "pipeline_parallel",
    label: "Sequential Debate",
    description: "Experts respond in sequence and build on each other's points.",
  },
];


type StreamingMessage = {
  id: string;
  author_id: string;
  content: string;
  argument_tag: "CLAIM" | "SUPPORT" | "REBUT" | "OTHER";
  cycle_id?: string | null;
  turn_index?: number | null;
};

type SpeakerStatus = "thinking" | "typing";

type MediatorPlanPayload = {
  cycle_id: string;
  turn_index: number;
  next_speaker_id?: string | null;
  reason: string;
  continue_cycle: boolean;
};

type TurnStartedPayload = {
  cycle_id: string;
  turn_index: number;
  speaker_id: string;
};

type AgentTokenPayload = {
  cycle_id: string;
  turn_index: number;
  agent_id: string;
  token: string;
};

type TurnCompletedPayload = {
  cycle_id: string;
  turn_index: number;
  speaker_id: string;
  message: ConversationMessage;
};

type CycleSynthesisPayload = {
  cycle_id: string;
  message: ConversationMessage;
};

function dedupePersonasByName(list: PersonaSchema[]): PersonaSchema[] {
  const seen = new Set<string>();
  const unique: PersonaSchema[] = [];
  for (const persona of list) {
    const key = persona.name.trim().toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    unique.push(persona);
  }
  return unique;
}

function firstMention(text: string): string | undefined {
  const match = text.match(/@([a-zA-Z0-9][a-zA-Z0-9_-]{1,63})/);
  return match?.[1];
}

export default function HomePage() {
  const [view, setView] = useState<"home" | "manual" | "custom">("home");
  const [panelId, setPanelId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [mediatorStatus, setMediatorStatus] = useState<string>("idle");
  const [nextSpeakerHint, setNextSpeakerHint] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, SpeakerStatus>>({});
  const [personas, setPersonas] = useState<PersonaSchema[]>([]);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [panelName, setPanelName] = useState("Expert Panel");
  const [panelMode, setPanelMode] = useState<PanelMode>("scatter_gather");
  const [personasLoading, setPersonasLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const personaNameMap = useMemo(
    () => Object.fromEntries(personas.map((p) => [p.id, p.name])),
    [personas]
  );

  const nameFor = (id: string): string => personaNameMap[id] ?? id;

  const subtitle = useMemo(() => {
    if (sessionId) return `Session: ${sessionId.slice(0, 8)}…`;
    if (panelId) return `Panel: ${panelId.slice(0, 8)}…`;
    return "No active session — select a panel to start";
  }, [panelId, sessionId]);

  useEffect(() => {
    setPersonasLoading(true);
    listPersonas()
      .then(async (list) => {
        if (list.length > 0) {
          setPersonas(dedupePersonasByName(list));
          return;
        }
        const seeded = await seedPersonas();
        setPersonas(dedupePersonasByName(seeded));
      })
      .catch((err) => setError(String(err)))
      .finally(() => setPersonasLoading(false));
  }, []);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  function togglePersona(id: string) {
    setSelectedPersonaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 8 ? [...prev, id] : prev
    );
  }

  function appendMessage(message: ConversationMessage) {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }

  function handleSseEvent(parsed: SSEEvent) {
    if (parsed.type === "cycle.started") {
      setBusy(true);
      setNextSpeakerHint(null);
      setMediatorStatus("cycle.started");
      return;
    }

    if (parsed.type === "mediator.plan.updated") {
      const payload = parsed.payload as MediatorPlanPayload;
      setNextSpeakerHint(payload.next_speaker_id || null);
      setMediatorStatus(payload.continue_cycle ? payload.reason : "synthesis");
      return;
    }

    if (parsed.type === "turn.started") {
      const payload = parsed.payload as TurnStartedPayload;
      setAgentStatuses((prev) => ({ ...prev, [payload.speaker_id]: "thinking" }));
      setMediatorStatus(`turn ${payload.turn_index}: ${nameFor(payload.speaker_id)}`);
      return;
    }

    if (parsed.type === "agent.token") {
      const payload = parsed.payload as AgentTokenPayload;
      setAgentStatuses((prev) => ({ ...prev, [payload.agent_id]: "typing" }));
      setStreamingMessage((prev) => {
        if (!prev || prev.author_id !== payload.agent_id) {
          return {
            id: `stream-${payload.cycle_id}-${payload.turn_index}-${payload.agent_id}`,
            author_id: payload.agent_id,
            content: payload.token,
            argument_tag: "OTHER",
            cycle_id: payload.cycle_id,
            turn_index: payload.turn_index,
          };
        }
        return { ...prev, content: prev.content + payload.token };
      });
      return;
    }

    if (parsed.type === "turn.completed") {
      const payload = parsed.payload as TurnCompletedPayload;
      appendMessage(payload.message);
      setStreamingMessage((prev) => (prev && prev.author_id === payload.speaker_id ? null : prev));
      setAgentStatuses((prev) => {
        const next = { ...prev };
        delete next[payload.speaker_id];
        return next;
      });
      return;
    }

    if (parsed.type === "turn.interrupted") {
      const payload = parsed.payload as { speaker_id?: string; reason?: string };
      if (payload.speaker_id) {
        setAgentStatuses((prev) => {
          const next = { ...prev };
          delete next[payload.speaker_id as string];
          return next;
        });
      }
      setMediatorStatus(payload.reason ? `interrupted: ${payload.reason}` : "turn interrupted");
      return;
    }

    if (parsed.type === "cycle.synthesis.completed") {
      const payload = parsed.payload as CycleSynthesisPayload;
      appendMessage(payload.message);
      setStreamingMessage(null);
      setMediatorStatus("synthesis completed");
      return;
    }

    if (parsed.type === "cycle.completed") {
      const payload = parsed.payload as { turns_used?: number };
      setBusy(false);
      setStreamingMessage(null);
      setAgentStatuses({});
      setNextSpeakerHint(null);
      setMediatorStatus(
        payload.turns_used ? `cycle.completed (${payload.turns_used} turns)` : "cycle.completed"
      );
      return;
    }

    if (parsed.type === "session.error") {
      const payload = parsed.payload as { message?: string };
      setError(payload.message || JSON.stringify(parsed.payload));
      setBusy(false);
      setStreamingMessage(null);
      setAgentStatuses({});
    }
  }

  function connectEventStream(targetSessionId: string) {
    eventSourceRef.current?.close();
    const es = new EventSource(getSseUrl(targetSessionId));
    es.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as SSEEvent;
      handleSseEvent(parsed);
    };
    es.onerror = () => setMediatorStatus("connection error — retrying…");
    eventSourceRef.current = es;
  }

  async function connectSession(nextPanelId: string): Promise<string> {
    const session = await createSession({ panel_id: nextPanelId });
    setSessionId(session.id);
    setMediatorStatus("session.ready");
    setAgentStatuses({});
    setStreamingMessage(null);
    connectEventStream(session.id);
    return session.id;
  }

  async function handleCreatePanel() {
    if (selectedPersonaIds.length === 0) {
      setError("Select at least one persona.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const panel = await createPanel({ name: panelName, persona_ids: selectedPersonaIds, mode: panelMode });
      setPanelId(panel.id);
      setMessages([]);
      await connectSession(panel.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(text: string) {
    if (!sessionId || busy) return;

    const mention = firstMention(text);
    const optimisticId = crypto.randomUUID();
    const optimistic: ConversationMessage = {
      id: optimisticId,
      session_id: sessionId,
      role: "user",
      speaker_role: "user",
      author_id: "You",
      content: text,
      argument_tag: "CLAIM",
      cycle_id: null,
      turn_index: 0,
      reply_to_message_id: null,
      directed_to_persona_id: mention || null,
      mentioned_persona_ids: mention ? [mention] : [],
      reply_to: null,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    setMessages((prev) => [...prev, optimistic]);
    setBusy(true);
    try {
      const cycle = await postMessage(sessionId, { content: text, mention_persona_id: mention });
      setMessages((prev) =>
        prev.map((msg) => (msg.id === optimisticId ? { ...msg, cycle_id: cycle.cycle_id, turn_index: 0 } : msg))
      );
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  function statusClassName(status: SpeakerStatus) {
    if (status === "typing") return "status-chip status-typing";
    return "status-chip status-thinking";
  }

  if (view === "custom") {
    return (
      <main data-testid="main" className="cpb-page">
        <div className="cpb-page-bg" aria-hidden="true">
          <div className="cpb-page-blob cpb-page-blob--right" />
          <div className="cpb-page-blob cpb-page-blob--left" />
        </div>

        <div className="cpb-page-inner">
          <button className="cpb-page-back" onClick={() => setView("home")}>
            ← All Panels
          </button>

          <header className="cpb-page-header">
            <h1 className="cpb-page-title">Assemble The Midnight Panel</h1>
            <p className="cpb-page-subtitle">
              Name your experts, define their voices, and open the chamber.
            </p>
          </header>

          {error && (
            <div data-testid="error-banner" className="poe-error" style={{ maxWidth: "48rem", width: "100%", margin: "0 auto 1rem" }}>
              <span>{error}</span>
              <button className="poe-error-dismiss" onClick={() => setError(null)}>✕</button>
            </div>
          )}

          <CustomPanelBuilder
            onLaunch={(sid, pid, personaIds) => {
              setPanelId(pid);
              setSessionId(sid);
              setSelectedPersonaIds(personaIds);
              setMessages([]);
              setMediatorStatus("session.ready");
              setBusy(false);
              connectEventStream(sid);
              // Refresh so custom persona names appear in the name map
              listPersonas().then(setPersonas).catch(() => {});
              setView("manual");
            }}
            onCancel={() => setView("home")}
          />
        </div>
      </main>
    );
  }

  if (view === "home" && !sessionId) {
    return (
      <main data-testid="main" className="poe-shell">
        <div className="poe-hero">
          <div className="poe-hero-content">
            <span className="poe-kicker">The Midnight Deliberation Chamber</span>
            <h1 className="poe-title">POE: Panel Of Experts</h1>
            <p data-testid="subtitle" className="poe-subtitle">Choose a panel and enter the chamber</p>
          </div>
        </div>

        {error && (
          <div data-testid="error-banner" className="poe-error">
            <span>{error}</span>
            <button className="poe-error-dismiss" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <div className="home-options">
          <button
            data-testid="start-custom"
            className="home-cta-card"
            onClick={() => setView("custom")}
          >
            <div className="home-cta-inner">
              <span className="home-cta-badge">New</span>
              <h2 className="home-cta-title">Summon Your Panel</h2>
              <p className="home-cta-desc">
                Raise three distinctive experts and let them deliberate in a darker, more theatrical forum.
              </p>
              <span className="home-cta-link">Open the ritual →</span>
            </div>
          </button>

          <button className="home-secondary-card" onClick={() => setView("manual")}>
            <span className="home-secondary-emoji">⚙️</span>
            <div>
              <h3 className="home-secondary-title">Advanced</h3>
              <p className="home-secondary-desc">Hand-pick any combination from the full persona library (up to 8 experts)</p>
            </div>
            <span className="home-secondary-cta">Configure →</span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main data-testid="main" className="poe-shell">
      <div className="poe-hero">
        <div className="poe-hero-content">
          <span className="poe-kicker">The Midnight Deliberation Chamber</span>
          <h1 className="poe-title">POE: Panel Of Experts</h1>
          <p data-testid="subtitle" className="poe-subtitle">{subtitle}</p>
        </div>
      </div>

      {error && (
        <div data-testid="error-banner" className="poe-error">
          <span>{error}</span>
          <button className="poe-error-dismiss" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      <div className="poe-grid">
        <SectionCard title="Panel Configuration">
          <div className="config-grid">
            <button
              className="builder-back-btn"
              style={{ marginBottom: "0.5rem" }}
              onClick={() => {
                eventSourceRef.current?.close();
                setSessionId(null);
                setPanelId(null);
                setMessages([]);
                setStreamingMessage(null);
                setAgentStatuses({});
                setMediatorStatus("idle");
                setView("home");
              }}
            >
              ← All Panels
            </button>

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
                onChange={(e) => setPanelMode(e.target.value as PanelMode)}
                className="config-select"
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="hint-line">
                {MODE_OPTIONS.find((option) => option.value === panelMode)?.description}
              </p>
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

        <SectionCard title="Threaded Discussion">
          <div data-testid="live-status" className="status-region">
            <p data-testid="mediator-status" className="status-label">Mediator: {mediatorStatus}</p>
            {nextSpeakerHint ? <p className="status-hint">Next: {nameFor(nextSpeakerHint)}</p> : null}
            <div data-testid="agent-statuses" className="status-chips">
              {Object.entries(agentStatuses).length === 0 ? (
                <span data-testid="agent-status-empty" className="status-chip">No active speakers</span>
              ) : (
                Object.entries(agentStatuses).map(([agentId, status]) => (
                  <span key={agentId} data-testid="agent-status" data-agent-id={agentId} data-status={status} className={statusClassName(status)}>
                    {nameFor(agentId)}: {status}
                  </span>
                ))
              )}
            </div>
          </div>

          <Thread messages={messages} streamingMessage={streamingMessage} personaNameMap={personaNameMap} />

          {!sessionId && (
            <p data-testid="no-session-hint" className="no-session-hint">
              Select personas on the left and click "Create Panel" to start.
            </p>
          )}

          <ChatInput
            disabled={!sessionId || busy}
            mentionOptions={selectedPersonaIds}
            onSend={handleSend}
          />
        </SectionCard>
      </div>
    </main>
  );
}
