import { createChatCompletionsProvider } from './openai-compatible';
import type { LLMProvider, ProviderOptions } from './types';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function createGroqProvider(options: ProviderOptions): LLMProvider {
  return createChatCompletionsProvider('groq', GROQ_URL, 'max_completion_tokens', options);
}
