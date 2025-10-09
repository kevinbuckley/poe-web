import { randomUUID } from "node:crypto";

import type { ConversationSession } from "../types";
import { BaseProvider } from "../providers";
import { emitSessionEvent, saveSession } from "../store/sessions";

export class AgenticLoop {
  constructor(private session: ConversationSession, private provider: BaseProvider) {}

  async step(userMessage?: string) {
    if (userMessage) {
      this.session.history.push({ role: "user", content: userMessage });
      if (this.session.status !== "active") {
        this.session.status = "active";
      }
      await saveSession(this.session);
    }
    if (this.session.status !== "active") {
      this.session.status = "active";
    }
    
    // Parse @ mentions and reorder experts
    const orderedExperts = this.reorderExpertsByMentions(userMessage);
    
    const panelReplies: { name: string; content: string }[] = [];
    for (let idx = 0; idx < orderedExperts.length; idx++) {
      const expert = orderedExperts[idx];
      const prior = panelReplies[idx - 1];
      const priorSnippet = this.buildPriorSnippet(prior?.content);
      const system = this.buildSystemMessage(expert.name, expert.persona);
      const user = this.buildUserMessage(expert.name, prior?.name, priorSnippet, userMessage);
      const turnId = this.generateTurnId();
      this.emitStart(expert.name, prior?.name, priorSnippet, turnId);
      const content = await this.streamFromProvider(
        expert.name,
        system,
        user,
        expert.model,
        prior?.name,
        priorSnippet,
        turnId,
      );
      await this.pushFinal(expert.name, content, prior?.name, priorSnippet, turnId);
      panelReplies.push({ name: expert.name, content });
    }
    return panelReplies[panelReplies.length - 1]?.content || '';
  }

  private reorderExpertsByMentions(userMessage?: string) {
    if (!userMessage) return this.session.experts;
    
    // Parse @ mentions from the user message
    const mentionPattern = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionPattern.exec(userMessage)) !== null) {
      mentions.push(match[1]);
    }
    
    if (mentions.length === 0) return this.session.experts;
    
    // Find mentioned experts and reorder them to the front
    const mentionedExperts = [];
    const remainingExperts = [];
    
    for (const expert of this.session.experts) {
      const isMentioned = mentions.some(mention => {
        const mentionLower = mention.toLowerCase();
        const nameLower = expert.name.toLowerCase();
        const idLower = expert.id.toLowerCase();
        
        // Match by full name, first name, or ID
        return nameLower.includes(mentionLower) ||
               idLower.includes(mentionLower) ||
               nameLower.split(' ')[0].includes(mentionLower) ||
               nameLower.split('(')[0].trim().toLowerCase().includes(mentionLower);
      });
      
      if (isMentioned) {
        mentionedExperts.push(expert);
      } else {
        remainingExperts.push(expert);
      }
    }
    
    // Return mentioned experts first, then the rest in original order
    return [...mentionedExperts, ...remainingExperts];
  }

  private buildPriorSnippet(priorContent?: string){
    if (!priorContent) return undefined as string | undefined;
    const sentences = priorContent.split(/(?<=[.!?])\s+/).filter(Boolean);
    return sentences.slice(0, 2).join(' ').slice(0, 240);
  }

  private buildSystemMessage(name: string, persona: string){
    return { role: 'system' as const, content: `${name}: ${persona}\nTone & style: Be friendly and human. Speak like you’re talking to a person. Use first person ("I"), short clear sentences, and concrete examples. Avoid bullet lists unless the user asks. Keep it warm, concise, and non-robotic.` };
  }

  private buildUserMessage(expertName: string, priorName: string | undefined, priorSnippet: string | undefined, userMessage?: string){
    const base = userMessage || 'Continue.';
    const content = priorSnippet
      ? `Build on ${priorName}: "${priorSnippet}". In <=4 short sentences: (1) acknowledge 1-2 specific points, (2) add 2-3 concrete, non-overlapping points from a ${expertName} view with specifics, (3) optionally note disagreements, (4) propose the next step. Topic: ${base}. Speak conversationally in first person; avoid lists unless asked.`
      : `From a ${expertName} view, give a crisp plan in <=4 short sentences: 2-3 concrete, actionable points with specifics and the next step. Topic: ${base}. Speak conversationally in first person; avoid lists unless asked.`;
    return { role: 'user' as const, content };
  }

  private generateTurnId(){
    try { return randomUUID(); } catch { return Math.random().toString(36).slice(2); }
  }

  private emitStart(expertName: string, replyToName?: string, replyToQuote?: string, turnId?: string) {
    const expertStart = { role: "expert" as const, name: expertName, content: "" };
    emitSessionEvent(this.session.id, {
      type: "message:start",
      message: expertStart,
      replyToName,
      replyToQuote,
      turnId,
    });
  }

  private async safeChat(system: {role:'system'; content:string}, user:{role:'user'; content:string}, model: string, expertName: string){
    try{ return await this.provider.chat([system, user], model); }
    catch(e: unknown){ const msg = e instanceof Error ? e.message : 'unknown error'; return `(${expertName} encountered an error: ${msg})`; }
  }

  private async streamFromProvider(
    expertName: string,
    system: { role: "system"; content: string },
    user: { role: "user"; content: string },
    model: string,
    replyToName?: string,
    replyToQuote?: string,
    turnId?: string,
  ) {
    let assembled = '';
    try{
      // Allow the event loop to flush the 'message:start' SSE before hitting the provider
      await Promise.resolve();
      // TEMP: log full prompt used
      try { console.info('[prompt]', JSON.stringify({ expertName, model, messages: [system, user] })); } catch {}
      const stream = this.provider.chatStream([system, user], model);
      for await (const delta of stream){
        assembled += delta;
        emitSessionEvent(this.session.id, {
          type: "message:delta",
          role: "expert",
          name: expertName,
          delta,
          replyToName,
          replyToQuote,
          turnId,
        });
      }
    } catch {
      // fallback to non-streaming
      const full = await this.safeChat(system, user, model, expertName);
      const chunks = full.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 4);
      for (const ch of chunks){
        assembled += (assembled ? ' ' : '') + ch;
        emitSessionEvent(this.session.id, {
          type: "message:delta",
          role: "expert",
          name: expertName,
          delta: ch,
          replyToName,
          replyToQuote,
          turnId,
        });
        await new Promise(r=>setTimeout(r, 30));
      }
    }
    // cap to 4 sentences for final
    const final = assembled.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,4).join(' ');
    return final;
  }

  private async pushFinal(
    expertName: string,
    content: string,
    replyToName?: string,
    replyToQuote?: string,
    turnId?: string,
  ) {
    const expertMsg = { role: "expert" as const, name: expertName, content };
    this.session.history.push(expertMsg);
    await saveSession(this.session);
    emitSessionEvent(this.session.id, {
      type: "message:end",
      message: expertMsg,
      replyToName,
      replyToQuote,
      turnId,
    });
  }
}
