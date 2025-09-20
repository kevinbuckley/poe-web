'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function LogoutButton(){
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async ()=>{
      try{
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        console.error('[logout] failed', e);
      } finally {
        router.replace('/login');
        router.refresh();
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-60"
      disabled={pending}
    >
      {pending ? 'Leaving…' : 'Logout'}
    </button>
  );
}

