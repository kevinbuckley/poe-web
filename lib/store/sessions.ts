import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

import { buildPanelPresets, type PanelPresetKey } from "../orchestration/panelPresets";
import type { ConversationSession, ExpertAgentConfig, ModeratorConfig } from "../types";
import { archiveSessionSnapshot } from "./archive";

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

const TTL_DEFAULT_SECONDS = 60 * 60 * 6; // 6 hours retains recent sessions without long tail storage
const parsedTtl = Number(process.env.SESSION_TTL_SECONDS);
const SESSION_TTL_SECONDS = Number.isFinite(parsedTtl) && parsedTtl > 0 ? Math.floor(parsedTtl) : TTL_DEFAULT_SECONDS;

const DRAFT_TTL_DEFAULT_SECONDS = 15 * 60; // 15 minutes for unopened sessions
const parsedDraftTtl = Number(process.env.SESSION_DRAFT_TTL_SECONDS);
const SESSION_DRAFT_TTL_SECONDS =
  Number.isFinite(parsedDraftTtl) && parsedDraftTtl > 0 ? Math.floor(parsedDraftTtl) : DRAFT_TTL_DEFAULT_SECONDS;

const HISTORY_DEFAULT = 120;
const parsedHistory = Number(process.env.SESSION_MAX_HISTORY);
const SESSION_MAX_HISTORY = Number.isFinite(parsedHistory) && parsedHistory > 0 ? Math.min(Math.floor(parsedHistory), 1000) : HISTORY_DEFAULT;

const EVENT_BUFFER_LIMIT = 500;

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

function compactHistory(history: ConversationSession["history"]): ConversationSession["history"] {
  if (!Array.isArray(history) || history.length === 0) return [];
  const startIndex = history.length > SESSION_MAX_HISTORY ? history.length - SESSION_MAX_HISTORY : 0;
  const sliced = history.slice(startIndex);
  return sliced.map(item => ({
    role: item.role,
    content: item.content,
    ...(item.name ? { name: item.name } : {}),
  }));
}

function buildPresetExperts(key: PanelPresetKey | undefined, modelHint: string | undefined): ExpertAgentConfig[] {
  if (!key) return [];
  const defaultModel = modelHint && modelHint.trim() ? modelHint : process.env.DEFAULT_MODEL || "gpt-4.1-nano";
  const preset = buildPanelPresets(defaultModel)[key];
  if (!preset) return [];
  return preset.experts.map(expert => ({ ...expert }));
}

function prepareForPersistence(session: ConversationSession): { record: ConversationSession; ttl: number } {
  const baseHistory = compactHistory(session.history);
  session.history = baseHistory;
  if (!session.status) session.status = session.history.length > 0 ? "active" : "draft";
  const ttl = session.status === "active" ? SESSION_TTL_SECONDS : SESSION_DRAFT_TTL_SECONDS;
  const base: ConversationSession = {
    ...session,
    history: baseHistory,
  };
  if (session.panelPresetKey) {
    return { record: { ...base, experts: [] }, ttl };
  }
  return { record: base, ttl };
}

function hydrateSession(record: ConversationSession | null): ConversationSession | null {
  if (!record) return null;
  const history = Array.isArray(record.history) ? record.history.map(item => ({ ...item })) : [];
  const status = record.status ?? (history.length > 0 ? "active" : "draft");
  const panelPresetKey = record.panelPresetKey;
  const experts = record.experts && record.experts.length > 0
    ? record.experts.map(expert => ({ ...expert }))
    : buildPresetExperts(panelPresetKey as PanelPresetKey | undefined, record.moderator?.model);
  return {
    ...record,
    status,
    history,
    experts,
  };
}

async function persistSession(session: ConversationSession): Promise<void> {
  const { record, ttl } = prepareForPersistence(session);
  if (haveRedis && redis) {
    await redis.set(sessKey(session.id), record, { ex: ttl });
  } else {
    memSessions.set(session.id, record);
  }
  if (record.status === "active" && record.history.length >= SESSION_MAX_HISTORY) {
    void archiveSessionSnapshot({ ...record, experts: session.experts });
  }
}

export async function createSession(init: {
  title?: string;
  experts: ExpertAgentConfig[];
  moderator: ModeratorConfig;
  autoDiscuss?: boolean;
  panelPresetKey?: PanelPresetKey;
}): Promise<ConversationSession> {
  const id = randomUUID();
  const session: ConversationSession = {
    id,
    title: init.title ?? `Session ${new Date().toLocaleString()}`,
    experts: init.experts,
    moderator: init.moderator,
    autoDiscuss: Boolean(init.autoDiscuss),
    history: [],
    panelPresetKey: init.panelPresetKey,
    status: "draft",
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
    return hydrateSession(stored ?? null);
  }

  return hydrateSession(memSessions.get(id) ?? null);
}

export async function resetSession(id: string): Promise<void> {
  const session = await getSession(id);
  if (!session) return;
  session.history = [];
  await saveSession(session);
}

export async function setAutoDiscuss(id: string, value: boolean): Promise<void> {
  const session = await getSession(id);
  if (!session) return;
  session.autoDiscuss = value;
  await saveSession(session);
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

  const arr = memEvents.get(sessionId) ?? [];
  arr.push(data);
  if (arr.length > EVENT_BUFFER_LIMIT) {
    arr.splice(0, arr.length - EVENT_BUFFER_LIMIT);
  }
  memEvents.set(sessionId, arr);

  const eventType = typeof payload === "object" && payload !== null ? (payload as { type?: string }).type : undefined;
  const shouldPersist = eventType === "message:end" || eventType === "message" || eventType === "message:start";
  if (shouldPersist && haveRedis && redis) {
    void redis
      .rpush(evKey(sessionId), data)
      .then(() => redis!.ltrim(evKey(sessionId), -EVENT_BUFFER_LIMIT, -1))
      .catch(() => {});
  }
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
