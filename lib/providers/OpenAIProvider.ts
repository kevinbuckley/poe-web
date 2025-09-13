import OpenAI from 'openai';
import { BaseProvider } from './BaseProvider';

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;
  constructor(apiKey: string, defaultModel: string) {
    super(apiKey, defaultModel);
    this.client = new OpenAI({ apiKey });
  }
  async chat(messages: {role: 'system'|'user'|'assistant'; content: string}[], model?: string) {
    const res = await this.client.chat.completions.create({
      model: model || this.defaultModel,
      messages,
    });
    return res.choices[0]?.message?.content || '';
  }

  async *chatStream(messages: {role: 'system'|'user'|'assistant'; content: string}[], model?: string) {
    const stream = await this.client.chat.completions.create({
      model: model || this.defaultModel,
      messages,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
