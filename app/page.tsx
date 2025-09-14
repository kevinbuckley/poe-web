'use client';
import Link from 'next/link';
export default function Page(){
  return (
    <main className="min-h-screen" style={{ backgroundColor:'#f6f7f3', backgroundImage:'radial-gradient(#dfe3e0 0.6px, transparent 0.6px)', backgroundSize:'18px 18px', backgroundPosition:'-10px -10px' }}>
      <div className="w-full px-6 py-16 flex flex-col items-center">
        <header className="mb-10 text-center p-6 pb-10">
          <h1 className="text-[40px] md:text-[48px] leading-[1.05] font-semibold tracking-tight text-slate-900">
            Panel of Experts
          </h1>
          <h2 className="text-slate-600 italic md:text-[24px] md:text-base max-w-[28ch] mx-auto">
            click your panel to get started
          </h2>
        </header>

        <div className="flex flex-col md:flex-row justify-center items-stretch gap-6 w-fit mx-auto">
          {/* Tech panel card */}
          <Link href="/start/tech" className="group relative block h-full w-[360px] max-w-full rounded-3xl border border-slate-200 bg-white/85 backdrop-blur-sm shadow-[0_12px_30px_rgba(2,6,23,0.08)] p-2 text-left hover:shadow-[0_18px_40px_rgba(2,6,23,0.12)] transition">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.6),transparent)]" />
            <h2 className="relative text-[20px] font-semibold tracking-tight text-slate-900 text-center">Tech Panel</h2>
            <ul className="relative mt-2 text-slate-600 text-sm md:text-base text-left space-y-1 list-none">
              <li className="block pl-2">Ada (inspired by Lovelace)</li>
              <li className="block pl-2">Linus (inspired by Torvalds)</li>
              <li className="block pl-2">Grace (inspired by Hopper)</li>
            </ul>
          </Link>

          {/* Philosophy panel card */}
          <Link href="/start/philosophy" className="group relative block h-full w-[360px] max-w-full rounded-3xl border border-slate-200 bg-white/85 backdrop-blur-sm shadow-[0_12px_30px_rgba(2,6,23,0.08)] p-2 text-left hover:shadow-[0_18px_40px_rgba(2,6,23,0.12)] transition">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.6),transparent)]" />
            <h2 className="relative text-[20px] font-semibold tracking-tight text-slate-900 text-center">Philosophy Panel</h2>
            <ul className="relative mt-2 text-slate-600 text-sm md:text-base text-left space-y-1 list-none">
              <li className="block pl-2">Aristotle</li>
              <li className="block pl-2">Nietzsche</li>
              <li className="block pl-2">Laozi</li>
            </ul>
          </Link>

          {/* Finance panel card */}
          <Link href="/start/finance" className="group relative block h-full w-[360px] max-w-full rounded-3xl border border-slate-200 bg-white/85 backdrop-blur-sm shadow-[0_12px_30px_rgba(2,6,23,0.08)] p-2 text-left hover:shadow-[0_18px_40px_rgba(2,6,23,0.12)] transition">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.6),transparent)]" />
            <h2 className="relative text-[20px] font-semibold tracking-tight text-slate-900 text-center">Finance Panel</h2>
            <ul className="relative mt-2 text-slate-600 text-sm md:text-base text-left space-y-1 list-none">
              <li className="block pl-2">Warren (inspired by Buffett)</li>
              <li className="block pl-2">Ray (inspired by Dalio)</li>
              <li className="block pl-2">Cathie (inspired by Wood)</li>
            </ul>
          </Link>
        </div>

      </div>
    </main>
  );
}
