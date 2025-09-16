export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { getSession, emitSessionEvent } from '../../../lib/store/sessions';
import { storageMode } from '../../../lib/store/sessions';
import { createProvider } from '../../../lib/providers';
import { AgenticLoop } from '../../../lib/orchestration/AgenticLoop';

export async function POST(req: NextRequest){
  try{
    const body = await req.json();
    let session = await getSession(body.sessionId);
    // brief retry to smooth KV propagation across regions/instances
    for (let i=0; !session && i<40; i++) { // ~10s total
      await new Promise(r=>setTimeout(r, 250));
      session = await getSession(body.sessionId);
    }
    if (!session) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type':'application/json', 'x-storage-mode': storageMode(), 'x-poe-session-id': String(body.sessionId||'') } });
    const provider = createProvider();
    const loop = new AgenticLoop(session, provider);
    const { searchParams } = new URL(req.url);
    const wait = searchParams.get('wait') === '1';
    if (wait){
      // Non-streaming fallback: run synchronously and return history
      const text = await loop.step(body.content);
      return new Response(JSON.stringify({ text, history: session.history }), { headers: { 'Content-Type':'application/json', 'x-storage-mode': storageMode(), 'x-poe-session-id': session.id } });
    }
    // Streaming path: signal and fire-and-forget
    // Do not emit prestart here; the loop emits start when each expert begins.
    loop.step(body.content).catch((e: unknown)=>{
      const msg = e instanceof Error ? e.message : 'Unknown error';
      emitSessionEvent(session.id, { type: 'message', message: { role: 'system', content: `Error: ${msg}` } });
    });
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type':'application/json', 'x-storage-mode': storageMode(), 'x-poe-session-id': session.id } });
  } catch (e: unknown){
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
