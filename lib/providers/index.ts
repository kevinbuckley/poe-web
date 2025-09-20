import { BaseProvider } from "./BaseProvider";
import { MockProvider } from "./MockProvider";
import { OpenAIProvider } from "./OpenAIProvider";

export function createProvider(): BaseProvider {
  const useMock = process.env.USE_MOCK_PROVIDER === "1" || process.env.USE_MOCK_PROVIDER === "true";
  const model = process.env.DEFAULT_MODEL || "gpt-4.1-nano";
  if (useMock) {
    return new MockProvider("mock", model);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when USE_MOCK_PROVIDER is not enabled.");
  }
  return new OpenAIProvider(apiKey, model);
}

export type { BaseProvider } from "./BaseProvider";
export { OpenAIProvider } from "./OpenAIProvider";
export { MockProvider } from "./MockProvider";

