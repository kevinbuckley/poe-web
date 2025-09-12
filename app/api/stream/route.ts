export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { getSession } from '../../../lib/store/sessions';

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') || '';
  const session = getSession(sessionId);
  if (!session) return new Response('Session not found', { status: 404 });
  const stream = new ReadableStream({
    start(controller){
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type:'init', history: session.history })}\n\n`));
    }
  });
  return new Response(stream, { headers: { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' } });
}
