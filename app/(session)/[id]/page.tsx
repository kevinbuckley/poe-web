'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

type Message = { role:'user'|'assistant'|'system'|'expert'|'moderator'; content:string; name?:string };

export default function SessionPage(){
  const router=useRouter();
  const params=useParams();
  const sessionId=(params?.id as string)||'';
  const [history,setHistory]=useState<Message[]>([]);
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{ if (sessionId) localStorage.setItem('poe.sessionId',sessionId); else { const sid=localStorage.getItem('poe.sessionId'); if (sid) router.replace('/session/'+sid); } },[sessionId, router]);
  useEffect(()=>{ if(!sessionId) return; const ev=new EventSource('/api/stream?sessionId='+sessionId); ev.onmessage=(e)=>{ const data=JSON.parse(e.data) as { type:string; history?:Message[] }; if(data.type==='init'){ setHistory(data.history||[]);} }; ev.onerror=()=>{ ev.close(); setTimeout(()=>location.reload(),1000); }; return ()=>ev.close(); },[sessionId]);
  async function send(){ const content=inputRef.current?.value||''; if(!content) return; const r=await fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, content})}); const j=await r.json(); setHistory(j.history as Message[]); if(inputRef.current) inputRef.current.value=''; }
  return (<main style={{padding:20}}><h2>Session {sessionId}</h2><div style={{border:'1px solid #ddd',padding:10,minHeight:200}}>{history.map((m,i)=>(<div key={i}><b>{m.role}</b>: {m.content}</div>))}</div><div style={{marginTop:10}}><input ref={inputRef} placeholder='Say something' /><button onClick={send}>Send</button></div></main>);}
