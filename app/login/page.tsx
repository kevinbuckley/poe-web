'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import windowImg from '../img/window.png';

export default function LoginPage(){
  const [pwd,setPwd]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{ setError(''); },[pwd]);

  async function submit(e: React.FormEvent){
    e.preventDefault();
    const r = await fetch('/api/auth/login',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pwd }) });
    if (r.ok){
      const raw = new URLSearchParams(location.search).get('next') || '';
      const safe = (s: string) => s.startsWith('/') && !s.includes('undefined') && s !== '/login';
      const next = safe(raw) ? raw : '/';
      console.log('[login] redirect ->', next, '(raw:', raw, ')');
      location.href = next;
    } else {
      const t = await r.text().catch(()=> '');
      setError(t || 'Invalid password');
    }
  }
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="w-full px-6 py-16 flex flex-col items-center">
        <header className="mb-8 text-center p-6 pb-8">
        <h1 className="text-[40px] md:text-[48px] leading-[1.05] font-semibold tracking-tight  text-slate-300">POE</h1>
        <div className="mb-4">
            <Image src={windowImg} alt="Bouncer peering through a small door window" className="mx-auto rounded-md" priority />
          </div>
          <p className="mt-1 text-slate-300">what&apos;s the password? this is exclusive access—whisper it</p>
        </header>
        <form onSubmit={submit} className="rounded-2xl border border-neutral-800 bg-neutral-900/80 backdrop-blur px-6 py-5 shadow-[0_12px_30px_rgba(0,0,0,0.6)] w-full max-w-md flex flex-col gap-3">
          <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="Password" className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-slate-400" />
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button type="submit" className="mt-2 inline-flex items-center justify-center rounded-full bg-white text-black px-5 py-2 text-sm font-medium shadow-sm hover:opacity-90 active:opacity-80 transition">Let me in</button>
        </form>
      </div>
    </main>
  );
}


