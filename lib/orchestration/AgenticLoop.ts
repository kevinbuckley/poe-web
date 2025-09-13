import { ConversationSession } from '../types';
import { BaseProvider } from '../providers';
import { emitSessionEvent } from '../store/sessions';

export class AgenticLoop {
  constructor(private session: ConversationSession, private provider: BaseProvider){}

  async step(userMessage?: string){
    if (userMessage) this.session.history.push({ role: 'user', content: userMessage });
    const panelReplies: { name: string; content: string }[] = [];
    for (let idx = 0; idx < this.session.experts.length; idx++){
      const expert = this.session.experts[idx];
      const prior = panelReplies[idx - 1];
      const priorSnippet = this.buildPriorSnippet(prior?.content);
      const system = this.buildSystemMessage(expert.name, expert.persona);
      const user = this.buildUserMessage(expert.name, prior?.name, priorSnippet, userMessage);
      const turnId = this.generateTurnId();
      this.emitStart(expert.name, prior?.name, priorSnippet, turnId);
      const expertReply = await this.safeChat(system, user, expert.model, expert.name);
      const content = await this.streamReply(expert.name, expertReply, prior?.name, priorSnippet, turnId);
      this.pushFinal(expert.name, content, prior?.name, priorSnippet, turnId);
      panelReplies.push({ name: expert.name, content });
    }
    return panelReplies[panelReplies.length - 1]?.content || '';
  }

  private buildPriorSnippet(priorContent?: string){
    if (!priorContent) return undefined as string | undefined;
    const sentences = priorContent.split(/(?<=[.!?])\s+/).filter(Boolean);
    return sentences.slice(0, 2).join(' ').slice(0, 240);
  }

  private buildSystemMessage(name: string, persona: string){
    return { role: 'system' as const, content: `${name}: ${persona}` };
  }

  private buildUserMessage(expertName: string, priorName: string | undefined, priorSnippet: string | undefined, userMessage?: string){
    const base = userMessage || 'Continue.';
    const content = priorSnippet
      ? `Build directly on ${priorName}'s points: "${priorSnippet}". Do ALL of the following: (1) explicitly acknowledge 1-2 specific points from ${priorName}, (2) add 2-3 non-overlapping, concrete points from a ${expertName} perspective with specifics (names, settings, trade-offs), (3) note any disagreement concisely if applicable, (4) propose the next concrete step. Avoid repeating prior text verbatim. Keep to <=4 sentences. The user's topic is: ${base}`
      : `Kick off with a crisp plan from a ${expertName} perspective. Provide 2-3 concrete, actionable points (names, settings, trade-offs), and propose the next step. Keep to <=4 sentences. The user's topic is: ${base}`;
    return { role: 'user' as const, content };
  }

  private generateTurnId(){
    return (globalThis as any).crypto?.randomUUID ? (globalThis as any).crypto.randomUUID() : Math.random().toString(36).slice(2);
  }

  private emitStart(expertName: string, replyToName?: string, replyToQuote?: string, turnId?: string){
    const expertStart = { role: 'expert' as const, name: expertName, content: '' };
    emitSessionEvent(this.session.id, { type: 'message:start', message: expertStart, replyToName, replyToQuote, turnId });
  }

  private async safeChat(system: {role:'system'; content:string}, user:{role:'user'; content:string}, model: string, expertName: string){
    try{ return await this.provider.chat([system, user], model); }
    catch(e: any){ return `(${expertName} encountered an error: ${e?.message || 'unknown error'})`; }
  }

  private async streamReply(expertName: string, fullText: string, replyToName?: string, replyToQuote?: string, turnId?: string){
    const chunks = fullText.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 4);
    let assembled = '';
    for (const ch of chunks){
      assembled += (assembled ? ' ' : '') + ch;
      emitSessionEvent(this.session.id, { type: 'message:delta', role: 'expert', name: expertName, delta: ch, replyToName, replyToQuote, turnId });
      await new Promise(r=>setTimeout(r, 40));
    }
    return assembled;
  }

  private pushFinal(expertName: string, content: string, replyToName?: string, replyToQuote?: string, turnId?: string){
    const expertMsg = { role: 'expert' as const, name: expertName, content };
    this.session.history.push(expertMsg);
    emitSessionEvent(this.session.id, { type: 'message:end', message: expertMsg, replyToName, replyToQuote, turnId });
  }
}
