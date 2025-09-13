import { ConversationSession, ExpertAgentConfig, ModeratorConfig } from '../types';

const g = globalThis as unknown as { __poeSessions?: Map<string, ConversationSession>; __poeListeners?: Map<string, Set<(data: string)=>void>> };
const sessions = g.__poeSessions || (g.__poeSessions = new Map<string, ConversationSession>());
const listeners = g.__poeListeners || (g.__poeListeners = new Map<string, Set<(data: string) => void>>());

export function createSession(init: { title?: string; experts: ExpertAgentConfig[]; moderator: ModeratorConfig; autoDiscuss?: boolean; }): ConversationSession {
  const id = crypto.randomUUID();
  const session: ConversationSession = {
    id,
    title: init.title || `Session ${new Date().toLocaleString()}`,
    experts: init.experts,
    moderator: init.moderator,
    autoDiscuss: !!init.autoDiscuss,
    history: []
  };
  sessions.set(id, session);
  // initialize listener set
  if (!listeners.has(id)) listeners.set(id, new Set());
  return session;
}

export function getSession(id: string){ return sessions.get(id); }
export function resetSession(id: string){ const s = sessions.get(id); if (s) s.history = []; }
export function setAutoDiscuss(id: string, value: boolean){ const s = sessions.get(id); if (s) s.autoDiscuss = value; }

// SSE helpers
export function onSessionEvent(sessionId: string, listener: (data: string) => void){
  let set = listeners.get(sessionId);
  if (!set) { set = new Set(); listeners.set(sessionId, set); }
  set.add(listener);
  return () => { set!.delete(listener); };
}

export function emitSessionEvent(sessionId: string, payload: unknown){
  const set = listeners.get(sessionId);
  if (!set || set.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const listener of set) listener(data);
}
