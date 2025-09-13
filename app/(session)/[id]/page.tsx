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
  useEffect(()=>{ if (sessionId) localStorage.setItem('poe.sessionId',sessionId); else { const sid=localStorage.getItem('poe.sessionId'); if (sid) router.replace('/'+sid); } },[sessionId, router]);
  useEffect(()=>{ if(!sessionId) return; const ev=new EventSource('/api/stream?sessionId='+sessionId); ev.onmessage=(e)=>{ const data=JSON.parse(e.data) as { type:string; history?:Message[]; message?:Message; role?:string; name?:string; delta?:string; replyToName?:string; replyToQuote?:string; turnId?: string };
    if(data.type==='init'){ setHistory(data.history||[]);} 
    if(data.type==='message' && data.message){ setHistory(h=>[...h, data.message!]); }
    if(data.type==='message:prestart' && data.message){ const msg = { ...data.message, content: ' .' } as Message; setHistory(h=>[...h, msg]); }
    if(data.type==='message:start' && data.message && data.message.name){
      setHistory(h=>{
        const copy=[...h];
        let replaced=false;
        for(let i=copy.length-1;i>=0;i--){
          const m=copy[i];
          if(m.role==='expert' && m.name===data.message!.name && !m.turnId && /^\s*\.+$/.test(m.content||'')){
            copy[i] = { ...(data.message as Message), turnId: data.turnId, replyToName: data.replyToName, replyToQuote: data.replyToQuote, content: ' .' };
            replaced=true;
            break;
          }
        }
        if(!replaced){
          const base = (data.message || { role:'expert', name: '', content:'' }) as Message;
          const msg = { ...base, turnId: data.turnId, replyToName: data.replyToName, replyToQuote: data.replyToQuote, content: base.content || ' .' } as Message;
          copy.push(msg);
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
  }; ev.onerror=()=>{ ev.close(); setTimeout(()=>location.reload(),1000); }; return ()=>ev.close(); },[sessionId]);

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
  return (<main style={{padding:20}}><h2>Session {sessionId}</h2><div style={{border:'1px solid #ddd',padding:10,minHeight:200}}>{history.map((m,i)=>(<div key={i}><b>{m.name || m.role}</b>: <span dangerouslySetInnerHTML={{ __html: renderContentHTML(m.role==='expert' && /^\s*\.+$/.test(m.content||'') ? (`*thinking ${m.content.trim()}*`) : m.content) }} /></div>))}</div><div style={{marginTop:10}}><input ref={inputRef} placeholder='Say something' onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); send(); } }} /><button onClick={send}>Send</button></div></main>); }
