import { createChatCompletionsProvider } from './openai-compatible';
import type { LLMProvider, ProviderOptions } from './types';

export const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

export function createMistralProvider(options: ProviderOptions): LLMProvider {
  return createChatCompletionsProvider('mistral', MISTRAL_URL, 'max_tokens', options);
}
