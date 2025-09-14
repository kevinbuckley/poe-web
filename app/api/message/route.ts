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
    // Immediately signal UI that first expert is starting to think
    const firstExpert = session.experts?.[0];
    if (firstExpert) {
      emitSessionEvent(session.id, { type: 'message:prestart', message: { role: 'expert', name: firstExpert.name, content: '' } });
    }
    // Fire-and-forget the step to enable immediate streaming via SSE
    loop.step(body.content).catch((e: unknown)=>{
      const msg = e instanceof Error ? e.message : 'Unknown error';
      emitSessionEvent(session.id, { type: 'message', message: { role: 'system', content: `Error: ${msg}` } });
    });
    // Respond immediately; UI will update via SSE
    return Response.json({ ok: true });
  } catch (e: unknown){
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
