import { OpenAIProvider } from './OpenAIProvider';
import { MockProvider } from './MockProvider';
import { BaseProvider } from './BaseProvider';

export function createProvider(): BaseProvider {
  const useMock = process.env.USE_MOCK_PROVIDER === '1' || process.env.USE_MOCK_PROVIDER === 'true';
  const model = process.env.DEFAULT_MODEL || 'gpt-4o-mini';
  if (useMock) {
    return new MockProvider('mock', model);
  }
  return new OpenAIProvider(process.env.OPENAI_API_KEY!, model);
}

export type { BaseProvider } from './BaseProvider';
export { OpenAIProvider } from './OpenAIProvider';
export { MockProvider } from './MockProvider';


