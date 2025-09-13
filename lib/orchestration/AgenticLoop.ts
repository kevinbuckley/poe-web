import { ConversationSession } from '../types';
import { BaseProvider } from '../providers';
import { emitSessionEvent } from '../store/sessions';

export class AgenticLoop {
  constructor(private session: ConversationSession, private provider: BaseProvider){}
  async step(userMessage?: string){
    if (userMessage) this.session.history.push({ role: 'user', content: userMessage });
    // Sequential panel: each expert responds in order, building on the previous
    const panelReplies: { name: string; content: string }[] = [];
    for (let idx = 0; idx < this.session.experts.length; idx++){
      const expert = this.session.experts[idx];
      const prior = panelReplies[idx - 1];
      const system = { role: 'system' as const, content: `${expert.name}: ${expert.persona}` };
      // Build a short snippet from the prior expert to encourage real cross-referencing
      const priorSnippet = prior ? (()=>{
        const sentences = prior.content.split(/(?<=[.!?])\s+/).filter(Boolean);
        return sentences.slice(0, 2).join(' ').slice(0, 240);
      })() : undefined;
      const composedUser = priorSnippet
        ? `Build directly on ${prior!.name}'s points: "${priorSnippet}". Do ALL of the following: (1) explicitly acknowledge 1-2 specific points from ${prior!.name}, (2) add 2-3 non-overlapping, concrete points from a ${expert.name} perspective with specifics (names, settings, trade-offs), (3) note any disagreement concisely if applicable, (4) propose the next concrete step. Avoid repeating prior text verbatim. Keep to <=4 sentences. The user's topic is: ${userMessage || 'Continue.'}`
        : `Kick off with a crisp plan from a ${expert.name} perspective. Provide 2-3 concrete, actionable points (names, settings, trade-offs), and propose the next step. Keep to <=4 sentences. The user's topic is: ${userMessage || 'Continue.'}`;
      const user = { role: 'user' as const, content: composedUser };

      // Broadcast start of expert message
      const expertStart = { role: 'expert' as const, name: expert.name, content: '' };
      emitSessionEvent(this.session.id, { type: 'message:start', message: expertStart, replyToName: prior?.name, replyToQuote: priorSnippet });

      let expertReply = '';
      try{
        expertReply = await this.provider.chat([system, user], expert.model);
      } catch (e: any){
        expertReply = `(${expert.name} encountered an error: ${e?.message || 'unknown error'})`;
      }
      // Stream in chunks (mocked by splitting sentences) and cap to 4 sentences max
      const chunks = expertReply
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean)
        .slice(0, 4);
      let assembled = '';
      for (const ch of chunks){
        assembled += (assembled ? ' ' : '') + ch;
        emitSessionEvent(this.session.id, { type: 'message:delta', role: 'expert', name: expert.name, delta: ch, replyToName: prior?.name, replyToQuote: priorSnippet });
        await new Promise(r=>setTimeout(r, 40));
      }
      const expertMsg = { role: 'expert' as const, name: expert.name, content: assembled };
      this.session.history.push(expertMsg);
      emitSessionEvent(this.session.id, { type: 'message:end', message: expertMsg, replyToName: prior?.name, replyToQuote: priorSnippet });
      panelReplies.push({ name: expert.name, content: expertMsg.content });
    }

    // Return last expert reply for API response convenience
    const last = panelReplies[panelReplies.length - 1]?.content || '';
    return last;
  }
}
