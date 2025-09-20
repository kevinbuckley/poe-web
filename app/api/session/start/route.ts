export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { createSession } from '../../../../lib/store/sessions';
import { createProvider } from '../../../../lib/providers';
import type { ExpertAgentConfig } from '../../../../lib/types';

export async function POST(req: NextRequest){
  const body = await req.json().catch(()=>({}));
  const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4.1-nano';
  const panel = (body.panel as string | undefined) || 'tech';

  const presets: Record<string, { title: string; experts: { id:string; name:string; provider:'openai'; model:string; persona:string }[] }> = {
    tech: {
      title: 'Tech Panel',
      experts: [
        { id:'expert-1', name:'Ada (inspired by Lovelace)', provider:'openai', model: defaultModel, persona:'Analytical backend design, algorithmic rigor, type systems, and code quality.' },
        { id:'expert-2', name:'Linus (inspired by Torvalds)', provider:'openai', model: defaultModel, persona:'Systems engineering, performance, scalability, pragmatic trade-offs, and kernel-level thinking.' },
        { id:'expert-3', name:'Grace (inspired by Hopper)', provider:'openai', model: defaultModel, persona:'Compilers, correctness, debugging, and making complex systems understandable.' },
      ],
    },
    philosophy: {
      title: 'Philosophy Panel',
      experts: [
        { id:'expert-1', name:'Aristotle', provider:'openai', model: defaultModel, persona:'Practical wisdom, virtue ethics, teleology, and clear categorization.' },
        { id:'expert-2', name:'Nietzsche', provider:'openai', model: defaultModel, persona:'Challenge assumptions, will to power, creative re-evaluation of values.' },
        { id:'expert-3', name:'Laozi', provider:'openai', model: defaultModel, persona:'Non-forcing, simplicity, balance, and flow in decision-making.' },
      ],
    },
    finance: {
      title: 'Finance Panel',
      experts: [
        { id:'expert-1', name:'Warren (inspired by Buffett)', provider:'openai', model: defaultModel, persona:'Value investing, moats, margin of safety, and long-term discipline.' },
        { id:'expert-2', name:'Ray (inspired by Dalio)', provider:'openai', model: defaultModel, persona:'Principles, macro cycles, risk parity, and systematic decision rules.' },
        { id:'expert-3', name:'Cathie (inspired by Wood)', provider:'openai', model: defaultModel, persona:'Disruptive innovation, thematic growth, risk-taking with conviction.' },
      ],
    },
  };

  const chosen = presets[panel] || presets.tech;
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

  const customExperts = panel === 'custom' ? normaliseCustomExperts() : undefined;
  const experts = customExperts || (Array.isArray(body.experts) && body.experts.length ? body.experts : chosen.experts);
  const moderator = body.moderator || { id:'moderator', name:'Moderator', provider:'openai', model: defaultModel, systemPrompt:'Be friendly and human. Make sure the user’s question is clearly answered. If anything is missing, briefly ask a follow-up. Keep it concise and conversational.' };
  const session = await createSession({ experts, moderator, autoDiscuss: !!body.autoDiscuss });
  const baseTitle = customExperts ? (typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Custom Panel') : chosen.title;
  session.title = `${baseTitle} – ${new Date().toLocaleString()}`;
  // quick provider instantiation check
  createProvider();
  return Response.json({ sessionId: session.id });
}

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const panel = (searchParams.get('panel') as string | null) || 'tech';
  const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4.1-nano';

  const presets: Record<string, { title: string; experts: { id:string; name:string; provider:'openai'; model:string; persona:string }[] }> = {
    tech: {
      title: 'Tech Panel',
      experts: [
        { id:'expert-1', name:'Ada (inspired by Lovelace)', provider:'openai', model: defaultModel, persona:'Analytical backend design, algorithmic rigor, type systems, and code quality.' },
        { id:'expert-2', name:'Linus (inspired by Torvalds)', provider:'openai', model: defaultModel, persona:'Systems engineering, performance, scalability, pragmatic trade-offs, and kernel-level thinking.' },
        { id:'expert-3', name:'Grace (inspired by Hopper)', provider:'openai', model: defaultModel, persona:'Compilers, correctness, debugging, and making complex systems understandable.' },
      ],
    },
    philosophy: {
      title: 'Philosophy Panel',
      experts: [
        { id:'expert-1', name:'Aristotle', provider:'openai', model: defaultModel, persona:'Practical wisdom, virtue ethics, teleology, and clear categorization.' },
        { id:'expert-2', name:'Nietzsche', provider:'openai', model: defaultModel, persona:'Challenge assumptions, will to power, creative re-evaluation of values.' },
        { id:'expert-3', name:'Laozi', provider:'openai', model: defaultModel, persona:'Non-forcing, simplicity, balance, and flow in decision-making.' },
      ],
    },
    finance: {
      title: 'Finance Panel',
      experts: [
        { id:'expert-1', name:'Warren (inspired by Buffett)', provider:'openai', model: defaultModel, persona:'Value investing, moats, margin of safety, and long-term discipline.' },
        { id:'expert-2', name:'Ray (inspired by Dalio)', provider:'openai', model: defaultModel, persona:'Principles, macro cycles, risk parity, and systematic decision rules.' },
        { id:'expert-3', name:'Cathie (inspired by Wood)', provider:'openai', model: defaultModel, persona:'Disruptive innovation, thematic growth, risk-taking with conviction.' },
      ],
    },
  };
  const chosen = presets[panel] || presets.tech;
  const session = await createSession({ experts: chosen.experts, moderator: { id:'moderator', name:'Moderator', provider:'openai', model: defaultModel, systemPrompt:'Be friendly and human. Make sure the user’s question is clearly answered. If anything is missing, briefly ask a follow-up. Keep it concise and conversational.' }, autoDiscuss: false });
  session.title = `${chosen.title} – ${new Date().toLocaleString()}`;
  createProvider();
  const url = new URL('/' + session.id, req.url);
  return Response.redirect(url);
}
