'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildPanelPresets } from '../lib/orchestration/panelPresets';
import { useLocalStorageState } from '../lib/hooks/useLocalStorageState';

type Props = { defaultModel: string };
type ExpertDraft = { id: string; name: string; persona: string };
type PanelDraft = { title: string; experts: ExpertDraft[] };

type PersonaSuggestion = {
  id: string;
  label: string;
  origin: string;
  persona: string;
};

type LlmSuggestion = {
  id?: string;
  label?: string;
  name?: string;
  origin?: string;
  persona?: string;
};

const normalisePanelKey = (title: string, roster: readonly ExpertDraft[]) => {
  const topic = title.trim() || initialPanelTitle;
  const simplified = roster.map(expert => ({
    name: expert.name.trim(),
    persona: expert.persona.trim(),
  }));
  return JSON.stringify({ topic, roster: simplified });
};

const templateExperts: ExpertDraft[] = [
  { id: 'expert-1', name: 'Visionary Strategist', persona: 'Connects the horizon to today. Spots emerging patterns, frames the opportunity, and keeps everyone anchored to the core objective.' },
  { id: 'expert-2', name: 'Pragmatic Builder', persona: 'Breaks big ideas into concrete steps. Loves constraints, trade-offs, and sequencing so the plan actually ships.' },
  { id: 'expert-3', name: 'Trusted Challenger', persona: 'Pressure-tests blind spots with empathy. Brings data, asks incisive questions, and protects the user experience.' },
];

const initialPanelTitle = 'My Custom Panel';
const initialPanelGoal = 'Keep the conversation on the outcomes that matter most.';

const createDefaultDraft = (): PanelDraft => ({
  title: initialPanelTitle,
  experts: templateExperts.map(expert => ({ ...expert })),
});

const formatList = (items: string[]) => {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i++){
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return Math.abs(hash);
};

export function CustomPanelBuilder({ defaultModel }: Props){
  const router = useRouter();
  const [draft, setDraft, resetDraft] = useLocalStorageState<PanelDraft>('poe.customPanelDraft', createDefaultDraft);
  const [step, setStep] = useState(0);
  const [panelTitle, setPanelTitle] = useState(() => (typeof draft.title === 'string' ? draft.title : initialPanelTitle));
  const panelGoal = initialPanelGoal;
  const [experts, setExperts] = useState<ExpertDraft[]>(() => {
    const base = Array.isArray(draft.experts) && draft.experts.length
      ? draft.experts
      : templateExperts;
    return base.slice(0, templateExperts.length).map((expert, index) => ({
      id: expert?.id || `expert-${index + 1}`,
      name: typeof expert?.name === 'string' && expert.name.trim() ? expert.name : templateExperts[index].name,
      persona: typeof expert?.persona === 'string' && expert.persona.trim() ? expert.persona : templateExperts[index].persona,
    }));
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personaPickerTarget, setPersonaPickerTarget] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<PersonaSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const panelCacheRef = useRef(new Map<string, { version: number; data?: PersonaSuggestion[][]; promise?: Promise<PersonaSuggestion[][]> }>());
  const [panelRefreshNonce, setPanelRefreshNonce] = useState(0);
  const panelKey = useMemo(() => normalisePanelKey(panelTitle, experts), [panelTitle, experts]);
  const rosterSnapshot = useMemo(() => experts.map(expert => ({
    name: expert.name.trim(),
    persona: expert.persona.trim(),
  })), [experts]);

  useEffect(() => {
    setDraft(prev => {
      const sameTitle = prev.title === panelTitle;
      const sameExperts = Array.isArray(prev.experts)
        && prev.experts.length === experts.length
        && prev.experts.every((expert, idx) => {
          const current = experts[idx];
          return (
            expert.id === current.id
            && expert.name === current.name
            && expert.persona === current.persona
          );
        });
      if (sameTitle && sameExperts) {
        return prev;
      }
      return {
        title: panelTitle,
        experts: experts.map(expert => ({ ...expert })),
      };
    });
  }, [experts, panelTitle, setDraft]);

  const resetPanelDraft = useCallback(() => {
    const defaults = createDefaultDraft();
    setPanelTitle(defaults.title);
    setExperts(defaults.experts.map(expert => ({ ...expert })));
    setStep(0);
    setError(null);
    setSuggestionError(null);
    setSuggestions([]);
    setPersonaPickerTarget(null);
    setPanelRefreshNonce(n => n + 1);
    resetDraft();
  }, [resetDraft, setPanelTitle, setExperts, setStep, setError, setSuggestionError, setSuggestions, setPersonaPickerTarget, setPanelRefreshNonce]);

  const totalSteps = 2;
  const progress = useMemo(() => ((step + 1) / totalSteps) * 100, [step]);

  const baseSuggestionPool = useMemo(() => {
    const presets = buildPanelPresets(defaultModel);
    return Object.values(presets).flatMap(preset =>
      preset.experts.map(expert => ({
        id: `${preset.title}-${expert.id}`,
        label: expert.name,
        origin: preset.title.replace(/ Panel$/i, '') || preset.title,
        persona: expert.persona,
      }))
    );
  }, [defaultModel]);

  const updateExpert = (index: number, updates: Partial<ExpertDraft>) => {
    setExperts(prev => prev.map((expert, i) => (i === index ? { ...expert, ...updates } : expert)));
  };

  const resetSlot = (index: number) => {
    const defaults = templateExperts[index];
    setExperts(prev => prev.map((expert, i) => (i === index ? { ...expert, name: defaults.name, persona: defaults.persona } : expert)));
  };

  const applySuggestion = (index: number, suggestion: PersonaSuggestion) => {
    const currentPanelKey = panelKey;
    const cacheEntry = panelCacheRef.current.get(currentPanelKey);
    setExperts(prev => {
      const next = prev.map((expert, i) => (i === index ? { ...expert, name: suggestion.label, persona: suggestion.persona } : expert));
      const nextPanelKey = normalisePanelKey(panelTitle, next);
      if (cacheEntry){
        panelCacheRef.current.set(nextPanelKey, cacheEntry);
      }
      return next;
    });
    setError(null);
  };

  const openPersonaPicker = (index: number) => {
    setSuggestionError(null);
    setPersonaPickerTarget(index);
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

  const generateFallbackSuggestions = useCallback((targetIndex: number, salt: number): PersonaSuggestion[] => {
    const topic = panelTitle.trim() || initialPanelTitle;
    const others = experts.filter((_, idx) => idx !== targetIndex);
    const otherNames = others.map(expert => expert.name.trim()).filter(name => name.length);
    const otherThemes = others
      .map(expert => expert.persona.split(/[.!?]/)[0]?.trim())
      .filter(theme => theme && theme.length) as string[];
    const takenNames = new Set(
      experts
        .map(expert => expert.name.trim().toLowerCase())
        .filter(name => name.length)
    );
    const seed = `${topic}|${otherNames.join('|')}|${targetIndex}|${salt}`;
    const offset = hashString(seed);
    const dynamic: PersonaSuggestion[] = [];
    const seen = new Set<string>();

    const contextualise = (base: PersonaSuggestion) => {
      const complements = otherNames.length
        ? `Pairs with ${formatList(otherNames)} by covering the edges they leave open.`
        : '';
      const focus = topic ? `Keeps the conversation grounded in ${topic}.` : '';
      const thematic = otherThemes.length ? `Extends threads like ${formatList(otherThemes.slice(0, 2))}.` : '';
      const additive = [base.persona, focus, complements, thematic].filter(Boolean).join(' ');
      return additive.trim();
    };

    for (let stepCount = 0; dynamic.length < 8 && stepCount < baseSuggestionPool.length * 3; stepCount++){
      const base = baseSuggestionPool[(offset + stepCount) % baseSuggestionPool.length];
      const label = base.label.trim();
      const lower = label.toLowerCase();
      if (takenNames.has(lower) || seen.has(lower)) continue;
      seen.add(lower);
      dynamic.push({
        id: `${base.id}-slot${targetIndex}-suggestion${dynamic.length}-s${salt}`,
        label,
        origin: `${base.origin} inspiration`,
        persona: contextualise(base),
      });
    }

    if (dynamic.length < 8){
      for (let idx = 0; dynamic.length < 8 && idx < baseSuggestionPool.length; idx++){
        const base = baseSuggestionPool[idx];
        if (seen.has(base.label.toLowerCase())) continue;
        dynamic.push({
          id: `${base.id}-slot${targetIndex}-fallback${dynamic.length}-s${salt}`,
          label: base.label,
          origin: `${base.origin} inspiration`,
          persona: contextualise(base),
        });
        seen.add(base.label.toLowerCase());
      }
    }

    return dynamic.slice(0, 8);
  }, [panelTitle, experts, baseSuggestionPool]);

  const fetchPanelSuggestions = useCallback(async (panelKey: string, topic: string, roster: { name: string; persona: string }[]): Promise<PersonaSuggestion[][]> => {
    try{
      const res = await fetch('/api/persona/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, experts: roster }),
      });
      if (!res.ok){
        const text = await res.text().catch(()=> '');
        throw new Error(text || `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      const raw = data?.suggestionsBySlot as Record<string, LlmSuggestion[] | undefined> | undefined;
      if (!raw || typeof raw !== 'object') throw new Error('Invalid response payload.');
      const bundles: PersonaSuggestion[][] = roster.map((_, slotIdx) => {
        const list = Array.isArray(raw[slotIdx]) ? raw[slotIdx] : Array.isArray(raw[`seat_${slotIdx}`]) ? raw[`seat_${slotIdx}`] : [];
        const normalised = (list as LlmSuggestion[])
          .slice(0, 8)
          .map((item, idx): PersonaSuggestion => ({
            id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `llm-suggestion-${slotIdx}-${idx}`,
            label:
              typeof item.label === 'string' && item.label.trim()
                ? item.label.trim()
                : typeof item.name === 'string' && item.name.trim()
                  ? item.name.trim()
                  : `Persona ${idx + 1}`,
            origin: typeof item.origin === 'string' && item.origin.trim() ? item.origin.trim() : 'LLM generated',
            persona:
              typeof item.persona === 'string' && item.persona.trim()
                ? item.persona.trim()
                : 'Offers a distinctive viewpoint to round out the panel.',
          }));
        return normalised.length ? normalised : generateFallbackSuggestions(slotIdx, hashString(`${panelKey}|fallback|${slotIdx}`));
      });
      return bundles;
    } catch (error){
      const bundles = roster.map((_, slotIdx) =>
        generateFallbackSuggestions(slotIdx, hashString(`${panelKey}|fallback|${slotIdx}`))
      );
      setSuggestionError(error instanceof Error ? error.message : 'Failed to generate personas.');
      return bundles;
    }
  }, [generateFallbackSuggestions]);

  useEffect(() => {
    if (personaPickerTarget === null){
      setSuggestions([]);
      setLoadingSuggestions(false);
      setSuggestionError(null);
      return;
    }

    const key = panelKey;
    if (!panelCacheRef.current.has(key)){
      panelCacheRef.current.set(key, { version: 0 });
    }
    const entry = panelCacheRef.current.get(key)!;
    const { version } = entry;

    const finishWithData = (data: PersonaSuggestion[][]) => {
      const slotIndex = personaPickerTarget;
      const slotList = data[slotIndex] || [];
      const finalList = slotList.length
        ? slotList
        : generateFallbackSuggestions(slotIndex, hashString(`${key}|fallback|${slotIndex}`));
      setLoadingSuggestions(false);
      setSuggestionError(null);
      setSuggestions(finalList);
    };

    if (entry.data){
      finishWithData(entry.data);
      return;
    }

    let cancelled = false;
    setLoadingSuggestions(true);
    setSuggestionError(null);

    if (!entry.promise){
      const topicForKey = panelTitle.trim() || initialPanelTitle;
      entry.promise = fetchPanelSuggestions(key, topicForKey, rosterSnapshot).then(data => {
        const current = panelCacheRef.current.get(key);
        if (current && current.version === version){
          current.data = data;
          current.promise = undefined;
        }
        return data;
      }).catch(error => {
        const fallback = rosterSnapshot.map((_, idx) =>
          generateFallbackSuggestions(idx, hashString(`${key}|fallback|${idx}`))
        );
        const current = panelCacheRef.current.get(key);
        if (current && current.version === version){
          current.data = fallback;
          current.promise = undefined;
        }
        setSuggestionError(error instanceof Error ? error.message : 'Failed to generate personas.');
        return fallback;
      });
      panelCacheRef.current.set(key, entry);
    }

    entry.promise!
      .then(data => {
        if (cancelled) return;
        finishWithData(data);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSuggestions(false);
      });

    return () => { cancelled = true; };
  }, [personaPickerTarget, panelKey, rosterSnapshot, fetchPanelSuggestions, generateFallbackSuggestions, panelTitle, panelRefreshNonce]);

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
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Step {step + 1} of 2</p>
          <button
            type="button"
            onClick={resetPanelDraft}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400 hover:text-slate-800 disabled:opacity-50"
            disabled={submitting}
          >
            Reset panel draft
          </button>
        </div>
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
                      <button type="button" onClick={()=>openPersonaPicker(index)} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90">Persona ideas</button>
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
              <div className="flex flex-col gap-3">
                <div>
                  <h3 id="persona-picker-title" className="text-xl font-semibold text-slate-900">Pick a persona for Expert {personaPickerTarget + 1}</h3>
                  <p className="mt-1 text-sm text-slate-600">Generate fresh ideas that align with your panel&rsquo;s focus or reuse an existing legend.</p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={()=>{
                      if (personaPickerTarget === null) return;
                      const entry = panelCacheRef.current.get(panelKey);
                      const nextVersion = (entry?.version ?? 0) + 1;
                      if (entry){
                        entry.version = nextVersion;
                        entry.data = undefined;
                        entry.promise = undefined;
                      } else {
                        panelCacheRef.current.set(panelKey, { version: nextVersion });
                      }
                      setSuggestionError(null);
                      setLoadingSuggestions(true);
                      setPanelRefreshNonce(v => v + 1);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-60"
                    disabled={loadingSuggestions}
                  >
                    {loadingSuggestions ? 'Loading experts…' : 'Refresh tailored personas'}
                  </button>
                </div>
              </div>
              {suggestionError && (
                <p className="mt-4 text-sm text-rose-600">{suggestionError}</p>
              )}
              {loadingSuggestions && suggestions.length === 0 && (
                <p className="mt-6 text-sm text-slate-500">Loading experts…</p>
              )}
              {!loadingSuggestions && suggestions.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">Tap “Refresh tailored personas” to draft ideas that complement your current lineup.</p>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {suggestions.map(suggestion => (
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
