import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

import type { ConversationSession, ExpertAgentConfig, ModeratorConfig } from "../types";

type ListenerMap = Map<string, Set<(data: string) => void>>;

// Ensure singletons in dev/HMR and across modules
const g = globalThis as typeof globalThis & {
  __poe_listeners?: ListenerMap;
  __poe_memSessions?: Map<string, ConversationSession>;
  __poe_memEvents?: Map<string, string[]>;
};

const listeners: ListenerMap = g.__poe_listeners ?? (g.__poe_listeners = new Map());

// Accept either Upstash Redis or Vercel KV envs
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const haveRedis = Boolean(REDIS_URL && REDIS_TOKEN);
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h

export function storageMode(): "redis" | "memory" {
  return haveRedis ? "redis" : "memory";
}

let redis: Redis | undefined;
if (haveRedis) {
  redis = new Redis({ url: REDIS_URL as string, token: REDIS_TOKEN as string });
}

// Local/dev in-memory fallback (singleton)
const memSessions = g.__poe_memSessions ?? (g.__poe_memSessions = new Map<string, ConversationSession>());
const memEvents = g.__poe_memEvents ?? (g.__poe_memEvents = new Map<string, string[]>());

const sessKey = (id: string) => `sess:${id}`;
const evKey = (id: string) => `sess:${id}:events`;

async function persistSession(session: ConversationSession): Promise<void> {
  if (haveRedis && redis) {
    await redis.set(sessKey(session.id), session, { ex: SESSION_TTL_SECONDS });
    return;
  }

  memSessions.set(session.id, session);
}

export async function createSession(init: {
  title?: string;
  experts: ExpertAgentConfig[];
  moderator: ModeratorConfig;
  autoDiscuss?: boolean;
}): Promise<ConversationSession> {
  const id = randomUUID();
  const session: ConversationSession = {
    id,
    title: init.title ?? `Session ${new Date().toLocaleString()}`,
    experts: init.experts,
    moderator: init.moderator,
    autoDiscuss: Boolean(init.autoDiscuss),
    history: [],
  };

  await persistSession(session);
  if (!listeners.has(id)) listeners.set(id, new Set());
  return session;
}

export async function saveSession(session: ConversationSession): Promise<void> {
  await persistSession(session);
}

export async function getSession(id: string): Promise<ConversationSession | null> {
  if (!id) return null;

  if (haveRedis && redis) {
    const stored = await redis.get<ConversationSession>(sessKey(id));
    return stored ?? null;
  }

  return memSessions.get(id) ?? null;
}

export async function resetSession(id: string): Promise<void> {
  if (!id) return;

  if (haveRedis && redis) {
    const session = await redis.get<ConversationSession>(sessKey(id));
    if (!session) return;
    session.history = [];
    await persistSession(session);
    return;
  }

  const session = memSessions.get(id);
  if (!session) return;
  session.history = [];
  memSessions.set(id, session);
}

export async function setAutoDiscuss(id: string, value: boolean): Promise<void> {
  if (!id) return;

  if (haveRedis && redis) {
    const session = await redis.get<ConversationSession>(sessKey(id));
    if (!session) return;
    session.autoDiscuss = value;
    await persistSession(session);
    return;
  }

  const session = memSessions.get(id);
  if (!session) return;
  session.autoDiscuss = value;
  memSessions.set(id, session);
}

// SSE helpers
export function onSessionEvent(sessionId: string, listener: (data: string) => void): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export function emitSessionEvent(sessionId: string, payload: unknown): void {
  const set = listeners.get(sessionId);
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  if (set && set.size > 0) {
    for (const listener of set) listener(data);
  }

  if (haveRedis && redis) {
    void redis
      .rpush(evKey(sessionId), data)
      .then(() => redis!.ltrim(evKey(sessionId), -2000, -1))
      .catch(() => {});
    return;
  }

  const arr = memEvents.get(sessionId) ?? [];
  arr.push(data);
  if (arr.length > 2000) arr.shift();
  memEvents.set(sessionId, arr);
}

// Helpers for SSE polling
export async function getEventLen(sessionId: string): Promise<number> {
  if (!sessionId) return 0;

  if (haveRedis && redis) {
    const len = await redis.llen(evKey(sessionId));
    return len ?? 0;
  }

  return memEvents.get(sessionId)?.length ?? 0;
}

export async function getEventsFrom(sessionId: string, from: number): Promise<string[]> {
  if (!sessionId) return [];

  if (haveRedis && redis) {
    const items = await redis.lrange(evKey(sessionId), from, -1);
    return items ?? [];
  }

  const arr = memEvents.get(sessionId) ?? [];
  return arr.slice(from);
}
