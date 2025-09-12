import { ConversationSession } from '../types';
import { OpenAIProvider } from '../providers/OpenAIProvider';

export class AgenticLoop {
  constructor(private session: ConversationSession, private provider: OpenAIProvider){}
  async step(userMessage?: string){
    if (userMessage) this.session.history.push({ role: 'user', content: userMessage });
    const system = { role: 'system' as const, content: 'You are a panel of experts collaborating with a moderator.' };
    const user = { role: 'user' as const, content: userMessage || 'Continue.' };
    const reply = await this.provider.chat([system, user]);
    this.session.history.push({ role: 'assistant', content: reply });
    return reply;
  }
}
