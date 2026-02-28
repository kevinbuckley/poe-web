import {
  type CreatePanelRequest,
  type CreateSessionRequest,
  type Panel,
  type PersonaSchema,
  type PostMessageRequest,
  type Session,
  type StartCycleResponse,
  type SuggestVoiceRequest,
  type SuggestVoiceResponse,
  type SuggestPanelRequest,
  type SuggestPanelResponse,
} from "@poe/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function getSseUrl(sessionId: string): string {
  return `${API_BASE}/v1/sessions/${sessionId}/events`;
}

export function listPersonas(): Promise<PersonaSchema[]> {
  return json<PersonaSchema[]>(`${API_BASE}/v1/personas`);
}

export function seedPersonas(): Promise<PersonaSchema[]> {
  return json<PersonaSchema[]>(`${API_BASE}/v1/personas/seed`, { method: "POST" });
}

export function createPanel(payload: CreatePanelRequest): Promise<Panel> {
  return json<Panel>(`${API_BASE}/v1/panels`, { method: "POST", body: JSON.stringify(payload) });
}

export function upsertPersona(payload: PersonaSchema): Promise<PersonaSchema> {
  return json<PersonaSchema>(`${API_BASE}/v1/personas`, { method: "POST", body: JSON.stringify(payload) });
}

export function getPanel(panelId: string): Promise<Panel> {
  return json<Panel>(`${API_BASE}/v1/panels/${panelId}`);
}

export function createSession(payload: CreateSessionRequest): Promise<Session> {
  return json<Session>(`${API_BASE}/v1/sessions`, { method: "POST", body: JSON.stringify(payload) });
}

export function postMessage(sessionId: string, payload: PostMessageRequest): Promise<StartCycleResponse> {
  return json<StartCycleResponse>(`${API_BASE}/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function suggestVoice(payload: SuggestVoiceRequest): Promise<SuggestVoiceResponse> {
  return json<SuggestVoiceResponse>(`${API_BASE}/v1/personas/suggest-voice`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function suggestPanel(payload: SuggestPanelRequest): Promise<SuggestPanelResponse> {
  return json<SuggestPanelResponse>(`${API_BASE}/v1/panels/suggest`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
