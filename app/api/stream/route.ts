export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { getSession, onSessionEvent } from '../../../lib/store/sessions';

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') || '';
  const session = getSession(sessionId);
  if (!session) return new Response('Session not found', { status: 404 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller){
      let closed = false;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type:'init', history: session.history })}\n\n`));
      const off = onSessionEvent(sessionId, (data)=>{
        if (closed) return;
        try { controller.enqueue(encoder.encode(data)); } catch { /* stream closed */ }
      });
      // keepalive ping every 15s
      const ping = setInterval(()=> { if (!closed) { try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch {} } }, 15000);
      // expose cleanup via closure flags
      (controller as any)._cleanup = () => { if (!closed){ closed = true; clearInterval(ping); off(); } };
    },
    cancel(){ (this as any)._cleanup?.(); }
  });
  return new Response(stream, { headers: { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' } });
}
