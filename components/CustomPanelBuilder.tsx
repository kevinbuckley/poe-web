'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = { defaultModel: string };
type ExpertDraft = { id: string; name: string; persona: string };

type PersonaSuggestion = {
  id: string;
  label: string;
  origin: string;
  persona: string;
};

const templateExperts: ExpertDraft[] = [
  { id: 'expert-1', name: 'Visionary Strategist', persona: 'Connects the horizon to today. Spots emerging patterns, frames the opportunity, and keeps everyone anchored to the core objective.' },
  { id: 'expert-2', name: 'Pragmatic Builder', persona: 'Breaks big ideas into concrete steps. Loves constraints, trade-offs, and sequencing so the plan actually ships.' },
  { id: 'expert-3', name: 'Trusted Challenger', persona: 'Pressure-tests blind spots with empathy. Brings data, asks incisive questions, and protects the user experience.' },
];

const initialPanelTitle = 'My Custom Panel';
const initialPanelGoal = 'Keep the conversation on the outcomes that matter most.';

const personaSuggestions: PersonaSuggestion[] = [
  {
    id: 'ada-lovelace',
    label: 'Ada Lovelace',
    origin: 'Mathematician & OG computer theorist',
    persona: 'Designs algorithms like poetry, geeks out over clean abstractions, and loves pairing science with wild imagination.',
  },
  {
    id: 'grace-hopper',
    label: 'Grace Hopper',
    origin: 'Rear Admiral & compiler whisperer',
    persona: 'Swings a metaphorical debugger like a sword, demands plain English, and ships the thing today—not next sprint.',
  },
  {
    id: 'linus-torvalds',
    label: 'Linus Torvalds',
    origin: 'Creator of Linux & Git',
    persona: 'Brings glorious candor, nails performance conversations, and keeps the panel honest about what scales.',
  },
  {
    id: 'anthony-bourdain',
    label: 'Anthony Bourdain',
    origin: 'Chef, traveler, professional truth-teller',
    persona: 'Chases messy, real-world context, swaps stories over metaphorical street food, and calls out corporate flavorlessness instantly.',
  },
  {
    id: 'rihanna',
    label: 'Rihanna',
    origin: 'Artist & Fenty founder',
    persona: 'Mixes swagger with product instincts, obsesses over inclusive experiences, and knows how to make every launch feel like a drop.',
  },
  {
    id: 'neil-degrasse-tyson',
    label: 'Neil deGrasse Tyson',
    origin: 'Astrophysicist & cosmic hype man',
    persona: 'Zooms the conversation out to first principles, checks the math twice, and adds just the right amount of interstellar flair.',
  },
  {
    id: 'issa-rae',
    label: 'Issa Rae',
    origin: 'Writer, producer, entrepreneur',
    persona: 'Spots authentic human beats, writes dialogue that actually sounds like people, and keeps the panel witty and grounded.',
  },
  {
    id: 'simone-biles',
    label: 'Simone Biles',
    origin: 'Most decorated gymnast in history',
    persona: 'Sets insane execution bars, talks recovery and resilience like a pro, and reminds everyone that sticking the landing matters.',
  },
];

export function CustomPanelBuilder({ defaultModel }: Props){
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [panelTitle, setPanelTitle] = useState(initialPanelTitle);
  const panelGoal = initialPanelGoal;
  const [experts, setExperts] = useState<ExpertDraft[]>(() => templateExperts.map(expert => ({ ...expert })));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personaPickerTarget, setPersonaPickerTarget] = useState<number | null>(null);

  const totalSteps = 2;
  const progress = useMemo(() => ((step + 1) / totalSteps) * 100, [step]);

  const updateExpert = (index: number, updates: Partial<ExpertDraft>) => {
    setExperts(prev => prev.map((expert, i) => (i === index ? { ...expert, ...updates } : expert)));
  };

  const resetSlot = (index: number) => {
    const defaults = templateExperts[index];
    setExperts(prev => prev.map((expert, i) => (i === index ? { ...expert, name: defaults.name, persona: defaults.persona } : expert)));
  };

  const applySuggestion = (index: number, suggestion: PersonaSuggestion) => {
    setExperts(prev => prev.map((expert, i) => (i === index ? { ...expert, name: suggestion.label, persona: suggestion.persona } : expert)));
    setError(null);
  };

  const goNext = () => {
    setError(null);
    if (step === 0){
      const hasEmpty = experts.some(expert => !expert.name.trim() || !expert.persona.trim());
      if (hasEmpty){ setError('Give each expert a name and a short persona.'); return; }
      setStep(1);
      return;
    }
  };

  const goBack = () => {
    setError(null);
    if (step === 0) { router.push('/'); return; }
    setStep(0);
  };

  const launchPanel = async () => {
    setError(null);
    setSubmitting(true);
    try{
      const fallbackTitle = panelTitle.trim() || initialPanelTitle;
      const payload = {
        panel: 'custom',
        title: fallbackTitle,
        experts: experts.map((expert, index) => ({
          id: expert.id || `expert-${index + 1}`,
          name: expert.name.trim(),
          persona: expert.persona.trim(),
          provider: 'openai',
          model: defaultModel,
        })),
        autoDiscuss: false,
        panelGoal,
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

  const closePersonaPicker = () => setPersonaPickerTarget(null);

  useEffect(()=>{
    if (personaPickerTarget === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [personaPickerTarget]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-full bg-gradient-to-r from-slate-900 via-sky-700 to-emerald-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-500">Step {step + 1} of 2</p>
      </div>

      <div className="rounded-[32px] border border-slate-200 bg-white/90 backdrop-blur-sm shadow-[0_24px_55px_rgba(15,23,42,0.12)] p-8">
        <div>
        {step === 0 && (
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Curate your panel</h2>
            <p className="mt-2 text-slate-600 text-sm">Give each seat a memorable name and a quick persona. Tap “persona ideas” if you want a legendary guest suggestion.</p>

            <label className="mt-6 block text-sm font-medium text-slate-700">Panel title (optional)</label>
            <input
              value={panelTitle}
              onChange={e=>setPanelTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="e.g. Midnight Shipping Council"
              maxLength={60}
            />
            <p className="mt-1 text-xs text-slate-500">Blank is fine—we&apos;ll fallback to “{initialPanelTitle}”.</p>

            <div className="mt-6 space-y-5">
              {experts.map((expert, index) => (
                <div key={expert.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Expert {index + 1}</span>
                      <p className="mt-1 text-base font-semibold text-slate-900">{expert.name.trim() || 'Name this expert'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={()=>resetSlot(index)} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800">Reset</button>
                      <button type="button" onClick={()=>setPersonaPickerTarget(index)} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90">Persona ideas</button>
                    </div>
                  </div>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Name</label>
                  <input
                    value={expert.name}
                    onChange={e=>updateExpert(index, { name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    placeholder="e.g. Rihanna"
                    maxLength={60}
                  />
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Signature voice</label>
                  <textarea
                    value={expert.persona}
                    onChange={e=>updateExpert(index, { persona: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    rows={4}
                    placeholder="What perspective does this expert bring?"
                    maxLength={360}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Preview your panel</h2>
            <p className="mt-2 text-slate-600 text-sm">Give everything one last glance before you launch—feel free to hop back and tweak.</p>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-lg font-semibold text-slate-900">{panelTitle.trim() || initialPanelTitle}</h3>
                <p className="mt-1 text-sm text-slate-600">{panelGoal}</p>
              </div>
              {experts.map((expert)=> (
                <div key={expert.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">{expert.name.trim()}</p>
                  <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{expert.persona.trim()}</p>
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
          {step === 0 && (
            <button type="button" onClick={goNext} className="inline-flex items-center rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60" disabled={submitting}>
              Preview panel
            </button>
          )}
          {step === 1 && (
            <button type="button" onClick={launchPanel} className="inline-flex items-center rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60" disabled={submitting}>
              {submitting ? 'Launching…' : 'Launch panel'}
            </button>
          )}
        </div>
        </div>
      </div>

      {personaPickerTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="persona-picker-title">
          <div className="relative flex w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(2,6,23,0.25)]">
            <button type="button" onClick={closePersonaPicker} className="absolute right-4 top-4 text-slate-400 transition hover:text-slate-600" aria-label="Close persona picker">✕</button>
            <div className="px-6 py-6 overflow-y-auto">
              <h3 id="persona-picker-title" className="text-xl font-semibold text-slate-900">Pick a persona for Expert {personaPickerTarget + 1}</h3>
              <p className="mt-1 text-sm text-slate-600">Choose someone to drop into that seat. You can still edit their voice afterward.</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {personaSuggestions.map(suggestion => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={()=>{ applySuggestion(personaPickerTarget, suggestion); closePersonaPicker(); }}
                    className="group flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-slate-400 hover:shadow-[0_12px_24px_rgba(15,23,42,0.12)]"
                  >
                    <div>
                      <span className="inline-flex items-center rounded-full bg-slate-900/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-700">{suggestion.origin}</span>
                      <p className="mt-3 text-base font-semibold text-slate-900">{suggestion.label}</p>
                      <p className="mt-2 text-sm text-slate-600">{suggestion.persona}</p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                      Add to Expert {personaPickerTarget + 1}
                      <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
