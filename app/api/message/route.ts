export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { getSession } from '../../../lib/store/sessions';
import { createProvider } from '../../../lib/providers';
import { AgenticLoop } from '../../../lib/orchestration/AgenticLoop';

export async function POST(req: NextRequest){
  try{
    const body = await req.json();
    const session = getSession(body.sessionId);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
    const provider = createProvider();
    const loop = new AgenticLoop(session, provider);
    const text = await loop.step(body.content);
    return Response.json({ text, history: session.history });
  } catch (e: any){
    return Response.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
