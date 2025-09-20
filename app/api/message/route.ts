export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { AgenticLoop } from "../../../lib/orchestration/AgenticLoop";
import { createProvider } from "../../../lib/providers";
import { emitSessionEvent, getSession, storageMode } from "../../../lib/store/sessions";

type MessagePayload = {
  sessionId?: string;
  content?: string;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as MessagePayload;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing session id" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    let session = await getSession(sessionId);
    // brief retry to smooth KV propagation across regions/instances
    for (let i = 0; !session && i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      session = await getSession(sessionId);
    }
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...jsonHeaders, "x-storage-mode": storageMode(), "x-poe-session-id": sessionId },
      });
    }

    const provider = createProvider();
    const loop = new AgenticLoop(session, provider);
    const { searchParams } = new URL(req.url);
    const wait = searchParams.get("wait") === "1";
    const content = typeof body.content === "string" ? body.content : "";

    if (wait) {
      // Non-streaming fallback: run synchronously and return history
      const text = await loop.step(content);
      return new Response(JSON.stringify({ text, history: session.history }), {
        headers: { ...jsonHeaders, "x-storage-mode": storageMode(), "x-poe-session-id": session.id },
      });
    }

    // Streaming path: signal and fire-and-forget
    // Do not emit prestart here; the loop emits start when each expert begins.
    loop.step(content).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      emitSessionEvent(session.id, {
        type: "message",
        message: { role: "system", content: `Error: ${message}` },
      });
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...jsonHeaders, "x-storage-mode": storageMode(), "x-poe-session-id": session.id },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
