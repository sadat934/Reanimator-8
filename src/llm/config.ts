// LLM configuration, read from environment variables. SERVER-SIDE ONLY: never import this
// module from code that ships to the browser, because it handles API keys.
//
//   LLM_PROVIDER     primary provider: gemini | mistral | groq (default: gemini)
//   GEMINI_API_KEY   MISTRAL_API_KEY   GROQ_API_KEY   (a provider without a key is skipped)
//   GEMINI_MODEL     MISTRAL_MODEL     GROQ_MODEL     (no defaults in code; free-tier models change)
//
// The chain is the primary provider first, then the others in the default order below.
import type { ProviderName } from './types';

export const DEFAULT_ORDER: readonly ProviderName[] = ['gemini', 'mistral', 'groq'];

export type Env = Record<string, string | undefined>;

export interface ProviderSettings {
  name: ProviderName;
  /** Undefined when the key is not set: the provider is skipped. */
  apiKey: string | undefined;
  /** Undefined when the model variable is not set. */
  model: string | undefined;
  keyVar: string;
  modelVar: string;
}

export interface LLMConfig {
  /** Chain order, primary first. Includes providers without keys. */
  order: ProviderSettings[];
  /** Set when LLM_PROVIDER was present but not a known provider name. */
  invalidPrimary: string | undefined;
}

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export function loadLLMConfig(env: Env): LLMConfig {
  const requested = clean(env.LLM_PROVIDER)?.toLowerCase();
  const known = requested !== undefined && (DEFAULT_ORDER as readonly string[]).includes(requested);
  const primary = known ? (requested as ProviderName) : undefined;
  const names = primary ? [primary, ...DEFAULT_ORDER.filter((n) => n !== primary)] : [...DEFAULT_ORDER];
  const order = names.map((name): ProviderSettings => {
    const prefix = name.toUpperCase();
    return {
      name,
      keyVar: `${prefix}_API_KEY`,
      modelVar: `${prefix}_MODEL`,
      apiKey: clean(env[`${prefix}_API_KEY`]),
      model: clean(env[`${prefix}_MODEL`]),
    };
  });
  return { order, invalidPrimary: requested !== undefined && !known ? requested : undefined };
}
