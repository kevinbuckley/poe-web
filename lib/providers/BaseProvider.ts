export abstract class BaseProvider {
  protected apiKey: string;
  protected defaultModel: string;
  constructor(apiKey: string, defaultModel: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }
  abstract chat(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], model?: string): Promise<string>;
  // Optional streaming; default falls back to non-streaming chat
  async *chatStream(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], model?: string): AsyncGenerator<string> {
    const full = await this.chat(messages, model);
    // yield in small word chunks as a basic fallback
    const parts = full.split(/(\s+)/).filter(Boolean);
    for (const p of parts) {
      yield p;
    }
  }
}
