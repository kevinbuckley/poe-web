import { BaseProvider } from './BaseProvider';

export class MockProvider extends BaseProvider {
  async chat(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<string> {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const content = lastUser?.content || 'Continue.';
    return `Mock response: ${content}`;
  }
}


