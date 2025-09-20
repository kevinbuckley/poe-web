import { redirect } from 'next/navigation';
import { createSession } from '../../../lib/store/sessions';
import { createProvider } from '../../../lib/providers';
import { buildPanelPresets, type PanelPresetKey } from '../../../lib/orchestration/panelPresets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function StartPanelPage({ params }: { params: Promise<{ panel: string }> }){
  const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4.1-nano';
  const p = await params; const panel = p.panel || 'tech';

  const presets = buildPanelPresets(defaultModel);
  const chosen = presets[(panel as PanelPresetKey)] || presets.tech;
  const moderator = { id:'moderator', name:'Moderator', provider:'openai' as const, model: defaultModel, systemPrompt:'Be friendly and human. Make sure the user’s question is clearly answered. If anything is missing, briefly ask a follow-up. Keep it concise and conversational.' };
  const session = await createSession({ experts: chosen.experts, moderator, autoDiscuss: false });
  session.title = `${chosen.title} – ${new Date().toLocaleString()}`;
  // Force provider warm-up so first call is fast; ignore result
  try { createProvider(); } catch {}
  redirect('/' + session.id);
}
