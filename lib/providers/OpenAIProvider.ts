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
      temperature: 0.7
    });
    return res.choices[0]?.message?.content || '';
  }
}
