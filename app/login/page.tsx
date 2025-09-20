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
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-[-10%] h-[320px] w-[320px] rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-[-10%] bottom-[-15%] h-[360px] w-[360px] rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-2xl" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-12 px-6 py-16 md:flex-row md:items-stretch">
        <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center md:items-start md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            Private beta
          </span>
          <div>
            <h1 className="text-[42px] md:text-[56px] font-semibold leading-[1.05] tracking-tight text-white">POE</h1>
            <p className="mt-4 text-base text-slate-300 md:text-lg">
              A cozy backroom where a rotating panel of experts debates your toughest questions. Whisper the passphrase to step inside.
            </p>
          </div>
          <div className="relative max-w-sm rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.35)]">
            <Image src={windowImg} alt="Bouncer peering through a small door window" className="mx-auto h-auto w-full max-w-[220px] rounded-2xl shadow-[0_14px_35px_rgba(15,23,42,0.45)]" priority />
            <p className="mt-3 text-sm text-slate-300">“Say the word and I’ll let you through.”</p>
          </div>
        </div>

        <div className="w-full max-w-md">
          <form onSubmit={submit} className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/10 px-8 py-10 shadow-[0_24px_55px_rgba(15,23,42,0.4)] backdrop-blur">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_60%)] opacity-80" />
            <div className="relative flex flex-col gap-4">
              <div className="flex flex-col gap-1 text-left">
                <span className="text-sm font-semibold uppercase tracking-[0.25em] text-white/70">Credentials</span>
                <h2 className="text-2xl font-semibold text-white">Let’s confirm you’re invited</h2>
              </div>
              <input
                type="password"
                value={pwd}
                onChange={e=>setPwd(e.target.value)}
                placeholder="Password"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              {error && <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
              <button
                type="submit"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_14px_32px_rgba(255,255,255,0.35)] transition hover:shadow-[0_18px_40px_rgba(255,255,255,0.4)]"
              >
                Let me in
              </button>
              <p className="text-xs text-white/60">Hint: if you weren’t given the password, ask the host—it changes often.</p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

