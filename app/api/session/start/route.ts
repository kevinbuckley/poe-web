export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { createSession } from '../../../../lib/store/sessions';
import { OpenAIProvider } from '../../../../lib/providers/OpenAIProvider';

export async function POST(req: NextRequest){
  const body = await req.json().catch(()=>({}));
  const goal = body.goal || '';
  const experts = body.experts || [
    { id:'expert-1', name:'Backend Engineer', provider:'openai', model:'gpt-4o-mini', persona:'Backend architecture and code quality.' }
  ];
  const moderator = body.moderator || { id:'moderator', name:'Moderator', provider:'openai', model:'gpt-4o-mini', systemPrompt:'Guide towards productive outcomes.' };
  const session = createSession({ goal, experts, moderator, autoDiscuss: !!body.autoDiscuss });
  // quick provider instantiation check
  new OpenAIProvider(process.env.OPENAI_API_KEY!, 'gpt-4o-mini');
  return Response.json({ sessionId: session.id });
}
