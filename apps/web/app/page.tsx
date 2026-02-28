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

const PRESET_PANELS = [
  {
    key: "classic",
    name: "Classic",
    emoji: "🎓",
    description: "Timeless minds across science, philosophy, and faith",
    persona_ids: ["niels-bohr", "socrates", "sarah-congregant", "mark-vc"],
    experts: ["Niels Bohr", "Socrates", "Sarah", "Mark (VC)"],
  },
  {
    key: "tech",
    name: "Tech",
    emoji: "💻",
    description: "Engineering legends who built the computing world",
    persona_ids: ["ada-tech", "linus-tech", "grace-tech"],
    experts: ["Ada", "Linus", "Grace"],
  },
  {
    key: "philosophy",
    name: "Philosophy",
    emoji: "🏛️",
    description: "Ancient and modern thinkers challenging every assumption",
    persona_ids: ["aristotle-phil", "nietzsche-phil", "laozi-phil"],
    experts: ["Aristotle", "Nietzsche", "Laozi"],
  },
  {
    key: "finance",
    name: "Finance",
    emoji: "📈",
    description: "Legendary investors with radically different strategies",
    persona_ids: ["warren-finance", "ray-finance", "cathie-finance"],
    experts: ["Warren", "Ray", "Cathie"],
  },
] as const;

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
  const [panelMode, setPanelMode] = useState<"scatter_gather" | "pipeline_parallel">("scatter_gather");
  const [personasLoading, setPersonasLoading] = useState(false);
  const [presetLaunching, setPresetLaunching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
          setPersonas(list);
          return;
        }
        const seeded = await seedPersonas();
        setPersonas(seeded);
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
      setMediatorStatus(`turn ${payload.turn_index}: @${payload.speaker_id}`);
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

  async function launchPreset(preset: (typeof PRESET_PANELS)[number]) {
    setPresetLaunching(preset.key);
    setError(null);
    setMessages([]);
    try {
      const panel = await createPanel({
        name: preset.name,
        persona_ids: [...preset.persona_ids],
        mode: "scatter_gather",
      });
      setPanelId(panel.id);
      setSelectedPersonaIds([...preset.persona_ids]);
      await connectSession(panel.id);
      setView("manual");
    } catch (err) {
      setError(String(err));
    } finally {
      setPresetLaunching(null);
    }
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
      <main data-testid="main" className="poe-shell">
        <div className="poe-hero">
          <div className="poe-hero-content">
            <span className="poe-kicker">Live Deliberation Studio</span>
            <h1 className="poe-title">POE Platform</h1>
            <p data-testid="subtitle" className="poe-subtitle">Build your own panel of experts</p>
          </div>
        </div>

        {error && (
          <div data-testid="error-banner" className="poe-error">
            <span>{error}</span>
            <button className="poe-error-dismiss" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <div className="poe-single-col">
          <SectionCard title="Custom Panel Builder">
            <CustomPanelBuilder
              onLaunch={(sid, pid, personaIds) => {
                setPanelId(pid);
                setSessionId(sid);
                setSelectedPersonaIds(personaIds);
                setMessages([]);
                setMediatorStatus("session.ready");
                setBusy(false);
                connectEventStream(sid);
                setView("manual");
              }}
              onCancel={() => setView("home")}
            />
          </SectionCard>
        </div>
      </main>
    );
  }

  if (view === "home" && !sessionId) {
    return (
      <main data-testid="main" className="poe-shell">
        <div className="poe-hero">
          <div className="poe-hero-content">
            <span className="poe-kicker">Live Deliberation Studio</span>
            <h1 className="poe-title">POE Platform</h1>
            <p data-testid="subtitle" className="poe-subtitle">Choose a panel or build your own</p>
          </div>
        </div>

        {error && (
          <div data-testid="error-banner" className="poe-error">
            <span>{error}</span>
            <button className="poe-error-dismiss" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <div className="preset-grid">
          {PRESET_PANELS.map((preset) => (
            <button
              key={preset.key}
              className={`preset-card${presetLaunching === preset.key ? " launching" : ""}`}
              onClick={() => launchPreset(preset)}
              disabled={presetLaunching !== null || personasLoading}
            >
              <span className="preset-emoji">{preset.emoji}</span>
              <h3 className="preset-name">{preset.name}</h3>
              <p className="preset-desc">{preset.description}</p>
              <ul className="preset-experts">
                {preset.experts.map((e) => <li key={e}>{e}</li>)}
              </ul>
              <span className="preset-cta">{presetLaunching === preset.key ? "Launching…" : "Start →"}</span>
            </button>
          ))}

          <button className="preset-card preset-card--custom" onClick={() => setView("custom")}>
            <span className="preset-emoji">✦</span>
            <h3 className="preset-name">Build Your Own</h3>
            <p className="preset-desc">Design a custom panel with AI-suggested expert voices</p>
            <ul className="preset-experts">
              <li>Any 3 experts</li>
              <li>AI persona ideas</li>
              <li>Your topic</li>
            </ul>
            <span className="preset-cta">Customise →</span>
          </button>

          <button className="preset-card preset-card--manual" onClick={() => setView("manual")}>
            <span className="preset-emoji">⚙️</span>
            <h3 className="preset-name">Advanced</h3>
            <p className="preset-desc">Hand-pick any combination from the full persona library</p>
            <ul className="preset-experts">
              <li>Up to 8 experts</li>
              <li>Any mode</li>
              <li>Full control</li>
            </ul>
            <span className="preset-cta">Configure →</span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main data-testid="main" className="poe-shell">
      <div className="poe-hero">
        <div className="poe-hero-content">
          <span className="poe-kicker">Live Deliberation Studio</span>
          <h1 className="poe-title">POE Platform</h1>
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

        <SectionCard title="Threaded Discussion">
          <div data-testid="live-status" className="status-region">
            <p data-testid="mediator-status" className="status-label">Mediator: {mediatorStatus}</p>
            {nextSpeakerHint ? <p className="status-hint">Next speaker hint: @{nextSpeakerHint}</p> : null}
            <div data-testid="agent-statuses" className="status-chips">
              {Object.entries(agentStatuses).length === 0 ? (
                <span data-testid="agent-status-empty" className="status-chip">No active speakers</span>
              ) : (
                Object.entries(agentStatuses).map(([agentId, status]) => (
                  <span key={agentId} data-testid="agent-status" data-agent-id={agentId} data-status={status} className={statusClassName(status)}>
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
