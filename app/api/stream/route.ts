export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { getSession, onSessionEvent } from '../../../lib/store/sessions';

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') || '';
  console.info('[SSE] connect attempt', { sessionId });
  const session = getSession(sessionId);
  if (!session) {
    console.warn('[SSE] session not found', { sessionId });
    return new Response(`Session not found: ${sessionId}`, { status: 404 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller){
      let closed = false;
      // send padding prelude to defeat proxy buffering and flush immediately
      try { controller.enqueue(encoder.encode(`: prelude ${' '.repeat(8192)}\n\n`)); } catch {}
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type:'init', history: session.history })}\n\n`));
      const off = onSessionEvent(sessionId, (data)=>{
        if (closed) return;
        try { controller.enqueue(encoder.encode(data)); } catch { /* stream closed */ }
      });
      // keepalive ping every 15s
      const ping = setInterval(()=> { if (!closed) { try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch {} } }, 15000);
      // expose cleanup via closure flags without any-cast
      const cleanup = () => { if (!closed){ closed = true; clearInterval(ping); off(); } };
      Object.defineProperty(controller, '_cleanup', { value: cleanup });
    },
    cancel(){ (this as { _cleanup?: () => void })._cleanup?.(); }
  });
  console.info('[SSE] connected', { sessionId });
  return new Response(stream, { headers: { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'Keep-Alive':'timeout=60', 'X-Accel-Buffering':'no', 'x-poe-session-id': sessionId } });
}
