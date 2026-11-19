// Mistral and Groq both expose an OpenAI-style /chat/completions endpoint with a Bearer key.
import { postJson } from './http';
import { ProviderError } from './types';
import type { GenerateInput, LLMProvider, ProviderOptions } from './types';

interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

export function createChatCompletionsProvider(
  name: string,
  url: string,
  maxTokensField: 'max_tokens' | 'max_completion_tokens',
  options: ProviderOptions,
): LLMProvider {
  return {
    name,
    async generate({ system, user, maxTokens }: GenerateInput): Promise<string> {
      const data = (await postJson(
        name,
        url,
        { Authorization: `Bearer ${options.apiKey}` },
        {
          model: options.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          [maxTokensField]: maxTokens,
        },
        options,
      )) as ChatResponse;
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        throw new ProviderError(`${name} returned an empty response (${data.choices?.[0]?.finish_reason ?? 'no choices'})`);
      }
      return text;
    },
  };
}
