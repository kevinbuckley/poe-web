'use client';
import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useRouter, useParams } from 'next/navigation';

type Message = { role:'user'|'assistant'|'system'|'expert'|'moderator'; content:string; name?:string; replyToName?: string; replyToQuote?: string; turnId?: string };

export default function SessionPage(){
  const router=useRouter();
  const params=useParams();
  const sessionId=(params?.id as string)||'';
  const [history,setHistory]=useState<Message[]>([]);
  const inputRef=useRef<HTMLInputElement>(null);
  const activeConnId=useRef<string|null>(null);
  const reconnectTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{ if (sessionId) localStorage.setItem('poe.sessionId',sessionId); else { const sid=localStorage.getItem('poe.sessionId'); if (sid) router.replace('/'+sid); } },[sessionId, router]);
  useEffect(()=>{
    if(!sessionId) return;
    const url='/api/stream?sessionId='+sessionId;
    let aborted=false;
    const myId = Math.random().toString(36).slice(2);
    activeConnId.current = myId;
    const connect = () => {
      console.log('[SSE] opening', url);
      const ev=new EventSource(url);
      ev.onopen=()=>console.log('[SSE] open', sessionId);
      ev.onerror=(e)=>{ console.warn('[SSE] error', e); ev.close(); if(aborted || activeConnId.current!==myId) return; if(reconnectTimer.current) clearTimeout(reconnectTimer.current); reconnectTimer.current = setTimeout(()=>{ if(!aborted && activeConnId.current===myId) connect(); }, 1500); };
      ev.onmessage=(e)=>{ if(aborted || activeConnId.current!==myId) return; const data=JSON.parse(e.data) as { type:string; history?:Message[]; message?:Message; role?:string; name?:string; delta?:string; replyToName?:string; replyToQuote?:string; turnId?: string };
    if(data.type==='init'){ setHistory(data.history||[]);} 
    if(data.type==='message' && data.message){ setHistory(h=>[...h, data.message!]); }
    if(data.type==='message:prestart' && data.message){
      setHistory(h=>{
        // Avoid duplicate placeholders for the same expert before turnId is known
        const already = [...h].reverse().find(m=> m.role==='expert' && m.name===data.message!.name && !m.turnId && /^\s*\.+$/.test(m.content||''));
        if (already) return h;
        const msg = { ...(data.message as Message), content: ' .' } as Message;
        return [...h, msg];
      });
    }
    if(data.type==='message:start' && data.message && data.message.name){
      setHistory(h=>{
        const copy=[...h];
        let targetIndex=-1;
        for(let i=copy.length-1;i>=0;i--){
          const m=copy[i];
          if(m.role==='expert' && m.name===data.message!.name && !m.turnId && /^\s*\.+$/.test(m.content||'')){
            targetIndex = i;
            break;
          }
        }
        const newMsg = { ...(data.message as Message), turnId: data.turnId, replyToName: data.replyToName, replyToQuote: data.replyToQuote, content: ' .' } as Message;
        if (targetIndex>=0) copy[targetIndex] = newMsg; else { copy.push(newMsg); targetIndex = copy.length-1; }
        // Remove any other stale placeholders for this expert without a turnId
        for(let i=copy.length-1;i>=0;i--){
          if(i===targetIndex) continue;
          const m=copy[i];
          if(m.role==='expert' && m.name===data.message!.name && !m.turnId && /^\s*\.+$/.test(m.content||'')){
            copy.splice(i,1);
          }
        }
        return copy;
      });
    }
    if(data.type==='message:delta' && data.role && data.name && data.delta){ setHistory(h=>{ const copy=[...h]; for(let i=copy.length-1;i>=0;i--){ const m=copy[i]; if(m.role===data.role && m.name===data.name && (!data.turnId || m.turnId===data.turnId)){
          // advance thinking animation if still placeholder
          if(/^\s*\.+$/.test(m.content||'')){
            const dots=(m.content||'').length % 4; // 1..3 cycle, 0 -> 4
            const nextDots = '.'.repeat(dots===3?4:dots+1);
            copy[i] = { ...m, content: ' ' + nextDots };
          } else {
            const base=(m.content||'').replace(/^\s*\.+$/,'');
            copy[i]={...m, content:(base?base+' ':'') + data.delta};
          }
          break;
        } }
        return copy; }); }
    if(data.type==='message:end' && data.message){ setHistory(h=>{ const copy=[...h];
        for(let i=copy.length-1;i>=0;i--){ const m=copy[i]; if(m.role===data.message!.role && m.name===data.message!.name && (!data.turnId || m.turnId===data.turnId)){ copy[i] = { ...(data.message as Message), turnId: data.turnId || m.turnId, replyToName: data.replyToName || m.replyToName, replyToQuote: data.replyToQuote || m.replyToQuote }; break; } }
        return copy; }); }
      };
    };
    connect();
    return ()=>{ aborted=true; if (activeConnId.current===myId) activeConnId.current=null; if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current=null; } };
  },[sessionId]);

  // Animate thinking dots for any message that is still placeholder (dot-only)
  useEffect(()=>{
    const id=setInterval(()=>{
      setHistory(h=>{
        let changed=false;
        const next=h.map(m=>{
          if(m.role==='expert' && /^\s*\.+$/.test(m.content||'')){
            const dots=(m.content||'').trim().length; // 1..4
            const nextDots = '.'.repeat(dots===4?1:dots+1);
            changed=true;
            return { ...m, content: ' ' + nextDots };
          }
          return m;
        });
        return changed ? next : h;
      });
    }, 350);
    return ()=>clearInterval(id);
  },[]);
  async function send(){
    const content=inputRef.current?.value||'';
    if(!content) return;
    // Optimistically render the user's message in the chat list
    setHistory(h=>[...h,{ role:'user', content } as Message]);
    try{
      const r=await fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, content})});
      const ct=r.headers.get('content-type')||'';
      if(!r.ok){ const msg=await r.text().catch(()=>'' ); setHistory(h=>[...h,{role:'system',content:`Error: ${msg||r.statusText}`}]); return; }
      const j = ct.includes('application/json') ? await r.json() : { text: await r.text(), history: [] };
      if (j && Array.isArray(j.history)) setHistory(j.history as Message[]);
      else if (j && typeof j.text==='string') setHistory(h=>[...h,{role:'assistant',content:String(j.text)}]);
    } catch{ setHistory(h=>[...h,{role:'system',content:'Network error. Please try again.'}]); }
    finally { if(inputRef.current) inputRef.current.value=''; }
  }
  function renderContentHTML(text: string){ return DOMPurify.sanitize(String(marked.parse(text) || '')); }
  return (
    <main className="min-h-screen" style={{ backgroundColor:'#f6f7f3', backgroundImage:'radial-gradient(#dfe3e0 0.6px, transparent 0.6px)', backgroundSize:'18px 18px', backgroundPosition:'-10px -10px' }}>
      <div className="w-full px-6 py-16 flex flex-col items-center">
        <div className="absolute top-4 right-4">
          <form action="/api/auth/logout" method="post">
            <button className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs text-slate-700 hover:bg-white shadow-sm">Logout</button>
          </form>
        </div>
        <header className="mb-10 text-center p-6 pb-10">
          <h1 className="text-[40px] md:text-[48px] leading-[1.05] font-semibold tracking-tight text-slate-900">Panel discussion</h1>
          <h2 className="text-slate-600 italic md:text-[24px] md:text-base max-w-[28ch] mx-auto">your experts will speak in turn</h2>
        </header>

        <div className="w-full max-w-4xl pb-40" data-testid="chat-list">
          {history.map((m,i)=> {
            const isUser = m.role === 'user';
            const label = m.name || (m.role.charAt(0).toUpperCase() + m.role.slice(1));
            const isThinking = m.role==='expert' && /^\s*\.+$/.test(m.content||'');
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`} data-testid="chat-row">
                <div className={`max-w-[75%] ${isUser ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-900'} rounded-2xl px-4 py-3 shadow-sm border ${isUser ? 'border-slate-900' : 'border-slate-200'} relative`} data-testid={`bubble-${isUser ? 'user' : m.role}`}>
                  {!isUser && (
                    <div className="mb-1 text-[12px] font-medium text-slate-500" data-testid="bubble-label">{label}</div>
                  )}
                  <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : ''}`}>
                    <span dangerouslySetInnerHTML={{ __html: renderContentHTML(isThinking ? (`*thinking ${(m.content||'').trim()}*`) : (m.content||'')) }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-32px)] max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 px-4 py-3 shadow-[0_8px_24px_rgba(2,6,23,0.12)] flex items-center gap-3">
            <input
              ref={inputRef}
              placeholder="Say something"
              onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); send(); } }}
              className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <span className="text-xs text-slate-500 hidden sm:inline">Press Enter to send</span>
            <button onClick={send} className="inline-flex items-center rounded-full bg-slate-900 text-white px-5 py-2 text-sm font-medium shadow-sm hover:opacity-90 active:opacity-80 transition">Send</button>
          </div>
        </div>
      </div>
    </main>
  );
}
