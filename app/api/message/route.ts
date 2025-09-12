export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { getSession } from '../../../lib/store/sessions';
import { OpenAIProvider } from '../../../lib/providers/OpenAIProvider';
import { AgenticLoop } from '../../../lib/orchestration/AgenticLoop';

export async function POST(req: NextRequest){
  const body = await req.json();
  const session = getSession(body.sessionId);
  if (!session) return new Response('Session not found', { status: 404 });
  const provider = new OpenAIProvider(process.env.OPENAI_API_KEY!, 'gpt-4o-mini');
  const loop = new AgenticLoop(session, provider);
  const text = await loop.step(body.content);
  return Response.json({ text, history: session.history });
}
