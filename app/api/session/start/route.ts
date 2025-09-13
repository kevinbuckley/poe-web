export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { createSession } from '../../../../lib/store/sessions';
import { createProvider } from '../../../../lib/providers';

export async function POST(req: NextRequest){
  const body = await req.json().catch(()=>({}));
  const defaultModel = process.env.DEFAULT_MODEL || 'gpt-4o-mini';
  const experts = body.experts || [
    { id:'expert-1', name:'Backend Engineer', provider:'openai', model: defaultModel, persona:'Backend architecture and code quality.' },
    { id:'expert-2', name:'Frontend Architect', provider:'openai', model: defaultModel, persona:'UX, accessibility, and performance in web UIs.' },
    { id:'expert-3', name:'DevOps SRE', provider:'openai', model: defaultModel, persona:'Deployments, reliability, and cost-aware scaling.' }

  ];
  const moderator = body.moderator || { id:'moderator', name:'Moderator', provider:'openai', model:'gpt-4o-mini', systemPrompt:'Guide towards productive outcomes.' };
  const session = createSession({ experts, moderator, autoDiscuss: !!body.autoDiscuss });
  // quick provider instantiation check
  createProvider();
  return Response.json({ sessionId: session.id });
}
