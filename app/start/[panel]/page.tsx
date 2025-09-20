import { redirect } from 'next/navigation';
import { createSession } from '../../../lib/store/sessions';
import { createProvider } from '../../../lib/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function StartPanelPage({ params }: { params: Promise<{ panel: string }> }){
  const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4.1-nano';
  const p = await params; const panel = p.panel || 'tech';

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
    comedy: {
      title: 'Comedy Panel',
      experts: [
        { id:'expert-1', name:'George Carlin', provider:'openai', model: defaultModel, persona:'Biting social commentary, linguistic precision, and fearless truth-telling with wit.' },
        { id:'expert-2', name:'Jon Stewart', provider:'openai', model: defaultModel, persona:'Satirical political analysis, empathetic interviews, and incisive comedic timing.' },
        { id:'expert-3', name:'Dave Chapelle', provider:'openai', model: defaultModel, persona:'Candid storytelling, cultural humor, and improvisational edge with heart.' },
      ],
    },
  };
  const chosen = presets[panel] || presets.tech;
  const moderator = { id:'moderator', name:'Moderator', provider:'openai' as const, model: defaultModel, systemPrompt:'Be friendly and human. Make sure the user’s question is clearly answered. If anything is missing, briefly ask a follow-up. Keep it concise and conversational.' };
  const session = await createSession({ experts: chosen.experts, moderator, autoDiscuss: false });
  session.title = `${chosen.title} – ${new Date().toLocaleString()}`;
  // Force provider warm-up so first call is fast; ignore result
  try { createProvider(); } catch {}
  redirect('/' + session.id);
}
