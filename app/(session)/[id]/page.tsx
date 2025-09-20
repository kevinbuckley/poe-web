'use client';
import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useRouter, useParams } from 'next/navigation';
import { LogoutButton } from '../../../components/LogoutButton';

type Message = { role:'user'|'assistant'|'system'|'expert'|'moderator'; content:string; name?:string; replyToName?: string; replyToQuote?: string; turnId?: string };
type ExpertBrief = { id:string; name:string; persona:string; model:string };

const chipSwatches = [
  'border-sky-200 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15',
  'border-violet-200 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15',
  'border-emerald-200 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15',
  'border-amber-200 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15',
];

function isThinkingMessage(msg: Message){
  return msg.role==='expert' && /^\s*\.+$/.test(msg.content||'');
}

function cleanHistory(messages: Message[]){
  if (!Array.isArray(messages) || messages.length===0) return messages;
  const finalTurnIndex = new Map<string, number>();
  const finalNameIndex = new Map<string, number>();
  for (let idx=0; idx<messages.length; idx++){
    const msg = messages[idx];
    if (msg.role==='expert' && !isThinkingMessage(msg)){
      if (msg.turnId) finalTurnIndex.set(msg.turnId, idx);
      if (msg.name) finalNameIndex.set(msg.name, idx);
    }
  }
  const toRemove = new Set<number>();
  for (let idx=0; idx<messages.length; idx++){
    const msg = messages[idx];
    if (!(msg.role==='expert')) continue;
    if (!isThinkingMessage(msg)) continue;
    const turnId = msg.turnId;
    if (turnId && finalTurnIndex.has(turnId) && finalTurnIndex.get(turnId)! > idx){
      toRemove.add(idx);
      continue;
    }
    if ((!turnId || !finalTurnIndex.has(turnId)) && msg.name){
      const finalIdx = finalNameIndex.get(msg.name);
      if (typeof finalIdx === 'number' && finalIdx > idx){
        toRemove.add(idx);
      }
    }
  }
  if (!toRemove.size) return messages;
  return messages.filter((_, index)=> !toRemove.has(index));
}

export default function SessionPage(){
  const router=useRouter();
  const params=useParams();
  const sessionId=(params?.id as string)||'';
  const [history,setHistory]=useState<Message[]>([]);
  const [experts,setExperts]=useState<ExpertBrief[]>([]);
  const [sseReady,setSseReady]=useState<boolean>(false);
  const [promptPeek,setPromptPeek]=useState<{ name:string; prompt:string; model:string }|null>(null);
  const [panelTitle,setPanelTitle]=useState<string>('');
  const inputRef=useRef<HTMLInputElement>(null);
  const activeConnId=useRef<string|null>(null);
  const reconnectTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const setHistorySafe = (value: Message[] | ((prev: Message[]) => Message[])) => {
    setHistory(prev => {
      const next = typeof value === 'function' ? (value as (prev: Message[]) => Message[])(prev) : value;
      return cleanHistory(next);
    });
  };
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
      ev.onmessage=(e)=>{ if(aborted || activeConnId.current!==myId) return; const data=JSON.parse(e.data) as { type:string; history?:Message[]; message?:Message; role?:string; name?:string; delta?:string; replyToName?:string; replyToQuote?:string; turnId?: string; experts?:ExpertBrief[]; title?:string };
    if(data.type==='init'){ setHistorySafe(data.history||[]); if(Array.isArray(data.experts)){ setExperts(data.experts); } if(typeof data.title==='string') setPanelTitle(data.title); } 
    if(data.type==='ready'){ setSseReady(true); }
    if(data.type==='message' && data.message){ setHistorySafe(h=>[...h, data.message!]); }
    if(data.type==='message:prestart' && data.message){
      setHistorySafe(h=>{
        // Avoid duplicate placeholders for the same expert before turnId is known
        const already = [...h].reverse().find(m=> m.role==='expert' && m.name===data.message!.name && !m.turnId && /^\s*\.+$/.test(m.content||''));
        if (already) return h;
        const msg = { ...(data.message as Message), content: ' .' } as Message;
        return [...h, msg];
      });
    }
    if(data.type==='message:start' && data.message && data.message.name){
      setHistorySafe(h=>{
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
    if(data.type==='message:delta' && data.role && data.name && data.delta){ setHistorySafe(h=>{ const copy=[...h]; for(let i=copy.length-1;i>=0;i--){ const m=copy[i]; if(m.role===data.role && m.name===data.name && (!data.turnId || m.turnId===data.turnId)){
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
    if(data.type==='message:end' && data.message){ setHistorySafe(h=>{ const copy=[...h];
        for(let i=copy.length-1;i>=0;i--){ const m=copy[i]; if(m.role===data.message!.role && m.name===data.message!.name && (!data.turnId || m.turnId===data.turnId)){ copy[i] = { ...(data.message as Message), turnId: data.turnId || m.turnId, replyToName: data.replyToName || m.replyToName, replyToQuote: data.replyToQuote || m.replyToQuote }; break; } }
        return copy; }); }
      };
    };
    connect();
    return ()=>{ aborted=true; if (activeConnId.current===myId) activeConnId.current=null; if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current=null; } };
  },[sessionId]);
  useEffect(()=>{
    if(!promptPeek) return;
    const onKey=(event: KeyboardEvent)=>{ if(event.key==='Escape') setPromptPeek(null); };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[promptPeek]);
  
  // Animate thinking dots for any message that is still placeholder (dot-only)
  useEffect(()=>{
    const id=setInterval(()=>{
      setHistory(prev=>{
        const h=prev;
        let changed=false;
        const next=h.map(m=>{
          if(isThinkingMessage(m)){
            const dots=(m.content||'').trim().length; // 1..4
            const nextDots = '.'.repeat(dots===4?1:dots+1);
            changed=true;
            return { ...m, content: ' ' + nextDots };
          }
          return m;
        });
        const base = changed ? cleanHistory(next) : h;
        return base;
      });
    }, 350);
    return ()=>clearInterval(id);
  },[]);
  async function send(){
    const content=inputRef.current?.value||'';
    if(!content) return;
    // Optimistically render the user's message in the chat list
    setHistorySafe(h=>[...h,{ role:'user', content } as Message]);
    // Wait briefly for SSE init to ensure session is visible to backend (deploy consistency)
    if(!sseReady){
      const start=Date.now();
      while(!sseReady && Date.now()-start<5000){ await new Promise(r=>setTimeout(r, 100)); }
    }
    try{
      const r=await fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, content})});
      const ct=r.headers.get('content-type')||'';
      if(!r.ok){ const msg=await r.text().catch(()=>'' ); setHistorySafe(h=>[...h,{role:'system',content:`Error: ${msg||r.statusText}`}]); return; }
      const j = ct.includes('application/json') ? await r.json() : { text: await r.text(), history: [] };
      if (j && Array.isArray(j.history)) setHistorySafe(j.history as Message[]);
      else if (j && typeof j.text==='string') setHistorySafe(h=>[...h,{role:'assistant',content:String(j.text)}]);
    } catch{ setHistorySafe(h=>[...h,{role:'system',content:'Network error. Please try again.'}]); }
    finally { if(inputRef.current) inputRef.current.value=''; }
  }
  const focusPrompt=(expertName?:string)=>{
    if(!expertName) return;
    const expert=experts.find(e=>e.name===expertName);
    if(!expert) return;
    setPromptPeek({ name:expert.name, model:expert.model, prompt:expert.persona });
  };
  function renderContentHTML(text: string){ return DOMPurify.sanitize(String(marked.parse(text) || '')); }
  const startOver = () => {
    try { localStorage.removeItem('poe.sessionId'); } catch {}
    router.push('/');
  };
  return (
    <main className="min-h-screen" style={{ backgroundColor:'#f6f7f3', backgroundImage:'radial-gradient(#dfe3e0 0.6px, transparent 0.6px)', backgroundSize:'18px 18px', backgroundPosition:'-10px -10px' }}>
      <div className="w-full px-6 py-16 flex flex-col items-center">
        <div className="absolute top-4 right-4">
          <LogoutButton />
        </div>
        <header className="mb-10 text-center p-6 pb-10">
          <h1 className="text-[40px] md:text-[48px] leading-[1.05] font-semibold tracking-tight text-slate-900">Panel discussion</h1>
          <h2 className="text-slate-600 italic md:text-[24px] md:text-base max-w-[28ch] mx-auto">your experts will speak in turn</h2>
          <button
            type="button"
            onClick={startOver}
            data-testid="start-over"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
          >
            Start over
          </button>
        </header>

        {experts.length>0 && (
          <section className="relative mb-12 w-full max-w-4xl">
            <div className="relative overflow-hidden rounded-[36px] border border-slate-200 bg-white/85 px-6 py-6 shadow-[0_20px_45px_rgba(15,23,42,0.12)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,118,110,0.08),transparent_55%)] opacity-80" />
              <div className="relative flex flex-col gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Active panel</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3">
                    <h3 className="text-2xl font-semibold text-slate-900">{panelTitle ? panelTitle.split('–')[0].trim() : 'Active Session'}</h3>
                    {panelTitle && panelTitle.includes('–') && (
                      <span className="text-sm text-slate-400">{panelTitle.split('–').slice(1).join('–').trim()}</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    Tap an expert to peek at their persona or ask your next question to hear a new round.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {experts.map((expert, idx)=>{
                    const chipClass = chipSwatches[idx % chipSwatches.length];
                    return (
                      <button
                        key={expert.id || expert.name}
                        type="button"
                        onClick={()=>focusPrompt(expert.name)}
                        className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${chipClass}`}
                        aria-label={`View ${expert.name}'s personality`}
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-xs font-semibold text-slate-700 shadow-sm">
                          {(expert.name || '?').trim().charAt(0) || '?'}
                        </span>
                        <span className="pr-1 text-left">{expert.name}</span>
                        <span className="text-xs font-medium text-slate-500 transition group-hover:text-slate-600">View</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="w-full max-w-4xl pb-40" data-testid="chat-list">
          {history.map((m,i)=> {
            const isUser = m.role === 'user';
            const label = m.name || (m.role.charAt(0).toUpperCase() + m.role.slice(1));
            const isThinking = isThinkingMessage(m);
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`} data-testid="chat-row">
                <div className={`max-w-[75%] ${isUser ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-[0_15px_32px_rgba(15,23,42,0.38)] border border-transparent' : 'bg-white text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.12)] border border-slate-100'} rounded-3xl px-5 py-4 relative`} data-testid={`bubble-${isUser ? 'user' : m.role}`}>
                  {!isUser && (
                    <div className="mb-1 flex items-center justify-between gap-3 text-[12px] font-medium text-slate-500" data-testid="bubble-label">
                      <span>{label}</span>
                      {m.role==='expert' && m.name && experts.length>0 && (
                        <button type="button" onClick={()=>focusPrompt(m.name)} className="rounded-full border border-slate-300 px-2 py-[2px] text-[11px] font-normal text-slate-500 transition hover:border-slate-400 hover:text-slate-700" aria-label={`View ${label}'s personality`}>View Personality</button>
                      )}
                    </div>
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
      {promptPeek && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8 bg-slate-900/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="prompt-dialog-title">
          <div className="relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col">
            <button type="button" onClick={()=>setPromptPeek(null)} className="absolute right-3 top-3 text-slate-400 transition hover:text-slate-600" aria-label="Close prompt preview">✕</button>
            <div className="px-6 py-5 flex-1 overflow-y-auto">
              <h3 id="prompt-dialog-title" className="text-lg font-semibold text-slate-900">{promptPeek.name}&apos;s briefing</h3>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Model: {promptPeek.model}</p>
              <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                <pre className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-slate-800">{promptPeek.prompt}</pre>
              </div>
              <p className="mt-3 text-xs text-slate-500">Their persona frames how they respond. Share responsibly.</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
