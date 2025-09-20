'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = { defaultModel: string };
type ExpertDraft = { id: string; name: string; persona: string };

const templateExperts: ExpertDraft[] = [
  { id: 'expert-1', name: 'Visionary Strategist', persona: 'Connects the horizon to today. Spots emerging patterns, frames the opportunity, and keeps everyone anchored to the core objective.' },
  { id: 'expert-2', name: 'Pragmatic Builder', persona: 'Breaks big ideas into concrete steps. Loves constraints, trade-offs, and sequencing so the plan actually ships.' },
  { id: 'expert-3', name: 'Trusted Challenger', persona: 'Pressure-tests blind spots with empathy. Brings data, asks incisive questions, and protects the user experience.' },
];

export function CustomPanelBuilder({ defaultModel }: Props){
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [panelTitle, setPanelTitle] = useState('My Custom Panel');
  const [panelGoal, setPanelGoal] = useState('Keep the conversation on the outcomes that matter most.');
  const [experts, setExperts] = useState<ExpertDraft[]>(templateExperts);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = useMemo(() => ((step + 1) / 5) * 100, [step]);

  const currentExpert = experts[step - 1];

  const goNext = () => {
    setError(null);
    if (step === 0){
      if (!panelTitle.trim()) return setError('Give your panel a memorable name.');
      if (!panelGoal.trim()) return setError('Add a quick note describing what this team optimizes for.');
      setStep(1);
      return;
    }
    if (step >= 1 && step <= 3){
      if (!currentExpert.name.trim()) return setError('Name this expert so the user knows who is speaking.');
      if (!currentExpert.persona.trim()) return setError('Describe how this expert shows up.');
      if (step === 3) { setStep(4); } else { setStep(step + 1); }
      return;
    }
  };

  const goBack = () => {
    setError(null);
    if (step === 0) { router.push('/'); return; }
    setStep(step - 1);
  };

  const updateExpert = (index: number, updates: Partial<ExpertDraft>) => {
    setExperts(prev => prev.map((expert, i) => (i === index ? { ...expert, ...updates } : expert)));
  };

  const launchPanel = async () => {
    setError(null);
    setSubmitting(true);
    try{
      const payload = {
        panel: 'custom',
        title: panelTitle.trim(),
        experts: experts.map((expert, index) => ({
          id: expert.id || `expert-${index + 1}`,
          name: expert.name.trim(),
          persona: expert.persona.trim(),
          provider: 'openai',
          model: defaultModel,
        })),
        autoDiscuss: false,
        panelGoal: panelGoal.trim(),
      };
      const res = await fetch('/api/session/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok){
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const json = await res.json();
      if (!json?.sessionId) throw new Error('Missing session identifier.');
      router.push(`/${json.sessionId}`);
    } catch (e){
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-full bg-gradient-to-r from-slate-900 via-sky-700 to-emerald-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-500">Step {step + 1} of 5</p>
      </div>

      <div className="rounded-[32px] border border-slate-200 bg-white/90 backdrop-blur-sm shadow-[0_24px_55px_rgba(15,23,42,0.12)] p-8">
        {step === 0 && (
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Set the stage</h2>
            <p className="mt-2 text-slate-600 text-sm">We&apos;ll build a three-person panel that only exists for this session. Start by naming the team and how it helps you.</p>
            <label className="mt-6 block text-sm font-medium text-slate-700">Panel name</label>
            <input value={panelTitle} onChange={e=>setPanelTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500" placeholder="e.g. Product Strategy Council" maxLength={60} />
            <label className="mt-5 block text-sm font-medium text-slate-700">Panel mission</label>
            <textarea value={panelGoal} onChange={e=>setPanelGoal(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500" rows={4} placeholder="What do you want them to keep front-and-center?" maxLength={200} />
          </div>
        )}

        {step >= 1 && step <= 3 && (
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Expert {step}</h2>
            <p className="mt-2 text-slate-600 text-sm">Give this expert a memorable voice and a quick persona so the panel feels vivid.</p>
            <label className="mt-6 block text-sm font-medium text-slate-700">Expert name</label>
            <input value={currentExpert.name} onChange={e=>updateExpert(step - 1, { name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500" placeholder="e.g. Ava the System Thinker" maxLength={60} />
            <label className="mt-5 block text-sm font-medium text-slate-700">Persona &amp; strengths</label>
            <textarea value={currentExpert.persona} onChange={e=>updateExpert(step - 1, { persona: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500" rows={5} placeholder="What does this expert focus on? How do they advise?" maxLength={360} />
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Preview your panel</h2>
            <p className="mt-2 text-slate-600 text-sm">You can tweak anything before launching. Once you join the chat, this panel exists only for that session.</p>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-lg font-semibold text-slate-900">{panelTitle}</h3>
                <p className="mt-1 text-sm text-slate-600">{panelGoal}</p>
              </div>
              {experts.map((expert)=> (
                <div key={expert.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">{expert.name}</p>
                  <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{expert.persona}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button type="button" onClick={goBack} className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800" disabled={submitting}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < 4 && (
            <button type="button" onClick={goNext} className="inline-flex items-center rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60" disabled={submitting}>
              Next
            </button>
          )}
          {step === 4 && (
            <button type="button" onClick={launchPanel} className="inline-flex items-center rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60" disabled={submitting}>
              {submitting ? 'Launching…' : 'Launch panel'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
