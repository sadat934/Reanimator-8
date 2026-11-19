// Gemini via the REST generateContent endpoint (key in the x-goog-api-key header, never in the URL).
import { postJson } from './http';
import { ProviderError } from './types';
import type { GenerateInput, LLMProvider, ProviderOptions } from './types';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export function createGeminiProvider(options: ProviderOptions): LLMProvider {
  return {
    name: 'gemini',
    async generate({ system, user, maxTokens }: GenerateInput): Promise<string> {
      const url = `${GEMINI_BASE_URL}/${encodeURIComponent(options.model)}:generateContent`;
      const data = (await postJson(
        'gemini',
        url,
        { 'x-goog-api-key': options.apiKey },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        },
        options,
      )) as GeminiResponse;
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? '').join('');
      if (!text.trim()) {
        const why = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? 'no text';
        throw new ProviderError(`gemini returned an empty response (${why})`);
      }
      return text;
    },
  };
}
