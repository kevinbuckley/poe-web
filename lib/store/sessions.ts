import { ConversationSession, ExpertAgentConfig, ModeratorConfig } from '../types';
import { Redis } from '@upstash/redis';

// Ensure singletons in dev/HMR and across modules
const g = globalThis as unknown as {
  __poe_listeners?: Map<string, Set<(data: string) => void>>;
  __poe_memSessions?: Map<string, ConversationSession>;
  __poe_memEvents?: Map<string, string[]>;
};

const listeners = g.__poe_listeners || (g.__poe_listeners = new Map<string, Set<(data: string) => void>>());
const haveRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = haveRedis
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
  : undefined as unknown as Redis;

// Local/dev in-memory fallback (singleton)
const memSessions = g.__poe_memSessions || (g.__poe_memSessions = new Map<string, ConversationSession>());
const memEvents = g.__poe_memEvents || (g.__poe_memEvents = new Map<string, string[]>());

function sessKey(id: string){ return `sess:${id}`; }
function evKey(id: string){ return `sess:${id}:events`; }

export async function createSession(init: { title?: string; experts: ExpertAgentConfig[]; moderator: ModeratorConfig; autoDiscuss?: boolean; }): Promise<ConversationSession> {
  const id = crypto.randomUUID();
  const session: ConversationSession = {
    id,
    title: init.title || `Session ${new Date().toLocaleString()}`,
    experts: init.experts,
    moderator: init.moderator,
    autoDiscuss: !!init.autoDiscuss,
    history: []
  };
  // persist
  if (haveRedis) { try { await redis.set(sessKey(id), session, { ex: 60 * 60 * 24 }); } catch {} }
  else memSessions.set(id, session);
  if (!listeners.has(id)) listeners.set(id, new Set());
  return session;
}

export function getSession(id: string){ return haveRedis ? redis.get<ConversationSession>(sessKey(id)) : memSessions.get(id); }
export async function resetSession(id: string){
  if (haveRedis){ const s = await redis.get<ConversationSession>(sessKey(id)); if (s){ s.history=[]; await redis.set(sessKey(id), s, { ex: 60*60*24 }); } }
  else { const s = memSessions.get(id); if (s){ s.history=[]; memSessions.set(id, s); } }
}
export async function setAutoDiscuss(id: string, value: boolean){
  if (haveRedis){ const s = await redis.get<ConversationSession>(sessKey(id)); if (s){ s.autoDiscuss = value; await redis.set(sessKey(id), s, { ex: 60*60*24 }); } }
  else { const s = memSessions.get(id); if (s){ s.autoDiscuss=value; memSessions.set(id, s);} }
}

// SSE helpers
export function onSessionEvent(sessionId: string, listener: (data: string) => void){
  let set = listeners.get(sessionId);
  if (!set) { set = new Set(); listeners.set(sessionId, set); }
  set.add(listener);
  return () => { set!.delete(listener); };
}

export function emitSessionEvent(sessionId: string, payload: unknown){
  const set = listeners.get(sessionId);
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  if (set && set.size>0){ for (const listener of set) listener(data); }
  // also persist to Redis events for cross-instance SSE
  if (haveRedis) redis.rpush(evKey(sessionId), data).then(()=> redis.ltrim(evKey(sessionId), -2000, -1)).catch(()=>{});
  else {
    const arr = memEvents.get(sessionId) || [];
    arr.push(data); if (arr.length>2000) arr.shift();
    memEvents.set(sessionId, arr);
  }
}

// Helpers for SSE polling
export async function getEventLen(sessionId: string){
  if (haveRedis) return await redis.llen(evKey(sessionId));
  return (memEvents.get(sessionId)?.length) || 0;
}
export async function getEventsFrom(sessionId: string, from: number){
  if (haveRedis) return await redis.lrange(evKey(sessionId), from, -1);
  const arr = memEvents.get(sessionId) || [];
  return arr.slice(from);
}
