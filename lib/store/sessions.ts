import { ConversationSession, ExpertAgentConfig, ModeratorConfig } from '../types';

const sessions = new Map<string, ConversationSession>();

export function createSession(init: { title?: string; goal: string; experts: ExpertAgentConfig[]; moderator: ModeratorConfig; autoDiscuss?: boolean; }): ConversationSession {
  const id = crypto.randomUUID();
  const session: ConversationSession = {
    id,
    title: init.title || `Session ${new Date().toLocaleString()}`,
    goal: init.goal,
    experts: init.experts,
    moderator: init.moderator,
    autoDiscuss: !!init.autoDiscuss,
    history: []
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string){ return sessions.get(id); }
export function resetSession(id: string){ const s = sessions.get(id); if (s) s.history = []; }
export function setAutoDiscuss(id: string, value: boolean){ const s = sessions.get(id); if (s) s.autoDiscuss = value; }
