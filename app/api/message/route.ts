export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { getSession, emitSessionEvent } from '../../../lib/store/sessions';
import { createProvider } from '../../../lib/providers';
import { AgenticLoop } from '../../../lib/orchestration/AgenticLoop';

export async function POST(req: NextRequest){
  try{
    const body = await req.json();
    const session = getSession(body.sessionId);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
    const provider = createProvider();
    const loop = new AgenticLoop(session, provider);
    const { searchParams } = new URL(req.url);
    const wait = searchParams.get('wait') === '1';
    if (wait){
      // Non-streaming fallback: run synchronously and return history
      const text = await loop.step(body.content);
      return Response.json({ text, history: session.history });
    }
    // Streaming path: signal and fire-and-forget
    // Do not emit prestart here; the loop emits start when each expert begins.
    loop.step(body.content).catch((e: unknown)=>{
      const msg = e instanceof Error ? e.message : 'Unknown error';
      emitSessionEvent(session.id, { type: 'message', message: { role: 'system', content: `Error: ${msg}` } });
    });
    return Response.json({ ok: true });
  } catch (e: unknown){
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
