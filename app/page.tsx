'use client';
import Link from 'next/link';
import { LogoutButton } from '../components/LogoutButton';
export default function Page(){
  return (
    <main className="relative min-h-screen" style={{ backgroundColor:'#f6f7f3', backgroundImage:'radial-gradient(#dfe3e0 0.6px, transparent 0.6px)', backgroundSize:'18px 18px', backgroundPosition:'-10px -10px' }}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12%] top-[15%] h-[340px] w-[340px] rounded-full bg-slate-400/25 blur-3xl" />
        <div className="absolute right-[-14%] top-[40%] h-[320px] w-[320px] rounded-full bg-emerald-400/20 blur-3xl" />
      </div>
      <div className="relative z-10 w-full px-6 py-16 flex flex-col items-center">
        <div className="absolute top-4 right-4">
          <LogoutButton />
        </div>
        <header className="mb-10 text-center p-6 pb-10">
          <h1 className="text-[40px] md:text-[48px] leading-[1.05] font-semibold tracking-tight text-slate-900">
            Panel of Experts
          </h1>
          <h2 className="text-slate-600 italic md:text-[24px] md:text-base max-w-[28ch] mx-auto">
            click your panel to get started
          </h2>
        </header>

        <div className="flex flex-col md:flex-row justify-center items-stretch gap-6 w-full max-w-5xl mx-auto flex-wrap">
          {/* Tech panel card */}
          <Link href="/start/tech" data-testid="start-tech" className="group relative block h-full w-[360px] max-w-full rounded-3xl border border-slate-200 bg-white/85 backdrop-blur-sm shadow-[0_12px_30px_rgba(2,6,23,0.08)] p-2 text-left hover:shadow-[0_18px_40px_rgba(2,6,23,0.12)] transition">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.6),transparent)]" />
            <h2 className="relative text-[20px] font-semibold tracking-tight text-slate-900 text-center">Tech Panel</h2>
            <ul className="relative mt-2 text-slate-600 text-sm md:text-base text-left space-y-1 list-none">
              <li className="block pl-2">Ada (inspired by Lovelace)</li>
              <li className="block pl-2">Linus (inspired by Torvalds)</li>
              <li className="block pl-2">Grace (inspired by Hopper)</li>
            </ul>
          </Link>

          {/* Philosophy panel card */}
          <Link href="/start/philosophy" data-testid="start-philosophy" className="group relative block h-full w-[360px] max-w-full rounded-3xl border border-slate-200 bg-white/85 backdrop-blur-sm shadow-[0_12px_30px_rgba(2,6,23,0.08)] p-2 text-left hover:shadow-[0_18px_40px_rgba(2,6,23,0.12)] transition">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.6),transparent)]" />
            <h2 className="relative text-[20px] font-semibold tracking-tight text-slate-900 text-center">Philosophy Panel</h2>
            <ul className="relative mt-2 text-slate-600 text-sm md:text-base text-left space-y-1 list-none">
              <li className="block pl-2">Aristotle</li>
              <li className="block pl-2">Nietzsche</li>
              <li className="block pl-2">Laozi</li>
            </ul>
          </Link>

          {/* Finance panel card */}
          <Link href="/start/finance" data-testid="start-finance" className="group relative block h-full w-[360px] max-w-full rounded-3xl border border-slate-200 bg-white/85 backdrop-blur-sm shadow-[0_12px_30px_rgba(2,6,23,0.08)] p-2 text-left hover:shadow-[0_18px_40px_rgba(2,6,23,0.12)] transition">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.6),transparent)]" />
            <h2 className="relative text-[20px] font-semibold tracking-tight text-slate-900 text-center">Finance Panel</h2>
            <ul className="relative mt-2 text-slate-600 text-sm md:text-base text-left space-y-1 list-none">
              <li className="block pl-2">Warren (inspired by Buffett)</li>
              <li className="block pl-2">Ray (inspired by Dalio)</li>
              <li className="block pl-2">Cathie (inspired by Wood)</li>
            </ul>
          </Link>

          {/* Custom panel card */}
          <Link
            href="/start/custom"
            data-testid="start-custom"
            className="group relative block w-full basis-full rounded-3xl border-2 border-dashed border-slate-900 bg-slate-900 text-white/90 shadow-[0_18px_44px_rgba(2,6,23,0.14)] p-6 text-left transition hover:border-slate-700 hover:shadow-[0_24px_55px_rgba(2,6,23,0.18)]"
          >
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.25),transparent_55%)] opacity-80 transition group-hover:opacity-100" />
            <div className="relative flex flex-col gap-3">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">New</span>
              <h2 className="text-[24px] font-semibold tracking-tight">Build Your Panel</h2>
              <p className="text-sm md:text-base leading-snug text-white/80">
                Walk through a quick three-step wizard to name your experts and give them personalities. Your custom team exists only for this session.
              </p>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-white/90">
                Start custom session
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </div>
          </Link>
        </div>

      </div>
    </main>
  );
}
