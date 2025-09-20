export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { createSession, saveSession } from '../../../../lib/store/sessions';
import { createProvider } from '../../../../lib/providers';
import type { ExpertAgentConfig } from '../../../../lib/types';
import { buildPanelPresets, type PanelPresetKey } from '../../../../lib/orchestration/panelPresets';

const DEFAULT_PANEL: PanelPresetKey = 'tech';
type PanelPresetMap = ReturnType<typeof buildPanelPresets>;

const resolvePresets = (defaultModel: string): PanelPresetMap => buildPanelPresets(defaultModel);

const pickPreset = (presets: PanelPresetMap, key: string | undefined) =>
  presets[(key as PanelPresetKey) || DEFAULT_PANEL] || presets[DEFAULT_PANEL];

export async function POST(req: NextRequest){
  const body = await req.json().catch(() => ({}));
  const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4.1-nano';
  const presets = resolvePresets(defaultModel);
  const panelKey = (body.panel as string | undefined) || DEFAULT_PANEL;
  const chosen = pickPreset(presets, panelKey);

  const normaliseCustomExperts = () => {
    if (!Array.isArray(body.experts)) return undefined;
    const list: ExpertAgentConfig[] = [];
    for (let idx = 0; idx < Math.min(body.experts.length, 3); idx++){
      const raw = body.experts[idx] as Partial<ExpertAgentConfig> | undefined;
      const id = typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : `expert-${idx + 1}`;
      const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : `Expert ${idx + 1}`;
      const persona = typeof raw?.persona === 'string' && raw.persona.trim() ? raw.persona.trim() : 'Brings a balanced perspective to the discussion.';
      const model = typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : defaultModel;
      list.push({ id, name, persona, provider: 'openai', model });
    }
    return list.length ? list : undefined;
  };

  const customExperts = panelKey === 'custom' ? normaliseCustomExperts() : undefined;
  const experts = customExperts || (Array.isArray(body.experts) && body.experts.length ? body.experts : chosen.experts);
  const moderator = body.moderator || {
    id: 'moderator',
    name: 'Moderator',
    provider: 'openai',
    model: defaultModel,
    systemPrompt:
      'Be friendly and human. Make sure the user’s question is clearly answered. If anything is missing, briefly ask a follow-up. Keep it concise and conversational.',
  };
  const session = await createSession({ experts, moderator, autoDiscuss: !!body.autoDiscuss });
  const baseTitle = customExperts
    ? (typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Custom Panel')
    : chosen.title;
  session.title = `${baseTitle} – ${new Date().toLocaleString()}`;
  await saveSession(session);
  // quick provider instantiation check
  createProvider();
  return Response.json({ sessionId: session.id });
}

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const panel = (searchParams.get('panel') as string | null) || DEFAULT_PANEL;
  const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4.1-nano';
  const presets = resolvePresets(defaultModel);
  const chosen = pickPreset(presets, panel || undefined);

  const session = await createSession({
    experts: chosen.experts,
    moderator: {
      id: 'moderator',
      name: 'Moderator',
      provider: 'openai',
      model: defaultModel,
      systemPrompt:
        'Be friendly and human. Make sure the user’s question is clearly answered. If anything is missing, briefly ask a follow-up. Keep it concise and conversational.',
    },
    autoDiscuss: false,
  });
  session.title = `${chosen.title} – ${new Date().toLocaleString()}`;
  await saveSession(session);
  createProvider();
  const url = new URL('/' + session.id, req.url);
  return Response.redirect(url);
}
