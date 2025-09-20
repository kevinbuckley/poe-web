import { CustomPanelBuilder } from '../../../components/CustomPanelBuilder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function CustomStartPage(){
  const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4.1-nano';
  return (
    <main className="relative min-h-screen overflow-hidden" style={{ backgroundColor:'#f6f7f3', backgroundImage:'radial-gradient(#dfe3e0 0.6px, transparent 0.6px)', backgroundSize:'18px 18px', backgroundPosition:'-10px -10px' }}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12%] top-[12%] h-[320px] w-[320px] rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute left-[-10%] bottom-[18%] h-[360px] w-[360px] rounded-full bg-violet-400/18 blur-3xl" />
      </div>
      <div className="relative z-10 w-full px-6 py-16 flex flex-col items-center">
        <div className="absolute top-4 right-4">
          <form action="/api/auth/logout" method="post">
            <button className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs text-slate-700 hover:bg-white shadow-sm">Logout</button>
          </form>
        </div>
        <header className="mb-10 text-center p-6 pb-10">
          <h1 className="text-[40px] md:text-[48px] leading-[1.05] font-semibold tracking-tight text-slate-900">
            Design your panel
          </h1>
          <h2 className="text-slate-600 italic md:text-[24px] md:text-base max-w-[32ch] mx-auto">
            Name the team, describe three experts, and launch them into a private session.
          </h2>
        </header>
        <CustomPanelBuilder defaultModel={defaultModel} />
      </div>
    </main>
  );
}
