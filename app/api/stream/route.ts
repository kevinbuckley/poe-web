export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { getSession, getEventLen, getEventsFrom } from '../../../lib/store/sessions';
import type { ConversationSession } from '../../../lib/types';

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') || '';
  console.info('[SSE] connect attempt', { sessionId });
  let session = await getSession(sessionId) as ConversationSession | undefined;
  // If not found yet, keep the connection and poll until it appears.
  // This avoids flapping 404s when navigation outruns persistence.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller){
      let closed = false;
      // send padding prelude to defeat proxy buffering and flush immediately
      try { controller.enqueue(encoder.encode(`: prelude ${' '.repeat(8192)}\n\n`)); } catch {}
      // wait for session to exist
      try {
        let waitedMs = 0;
        while (!session && !closed && waitedMs < 10000){
          await new Promise(r=>setTimeout(r, 200));
          waitedMs += 200;
          session = await getSession(sessionId) as ConversationSession | undefined;
        }
      } catch {}
      if (!session){
        console.warn('[SSE] session not found after wait; sending soft error and closing', { sessionId });
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type:'error', message: 'Session not found' })}\n\n`)); } catch {}
        try { controller.close(); } catch {}
        return;
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type:'init', history: session.history })}\n\n`));
      // Immediately send a soft ack that SSE is ready so client may post
      try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type:'ready' })}\n\n`)); } catch {}
      // Poll events source-of-truth to avoid duplicate delivery with local listeners
      let index = 0;
      try { index = await getEventLen(sessionId); } catch {}
      const poll = setInterval(async ()=>{
        if (closed) return;
        try{
          const len = await getEventLen(sessionId);
          if (len > index){
            const items = await getEventsFrom(sessionId, index);
            for (const item of items){ try { controller.enqueue(encoder.encode(item)); } catch {} }
            index = len;
          }
        } catch {}
      }, 350);
      // keepalive ping every 15s
      const ping = setInterval(()=> { if (!closed) { try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch {} } }, 15000);
      // expose cleanup via closure flags without any-cast
      const cleanup = () => { if (!closed){ closed = true; clearInterval(ping); clearInterval(poll); } };
      Object.defineProperty(controller, '_cleanup', { value: cleanup });
    },
    cancel(){ (this as { _cleanup?: () => void })._cleanup?.(); }
  });
  console.info('[SSE] connected', { sessionId });
  return new Response(stream, { headers: { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'Keep-Alive':'timeout=60', 'X-Accel-Buffering':'no', 'x-poe-session-id': sessionId } });
}
