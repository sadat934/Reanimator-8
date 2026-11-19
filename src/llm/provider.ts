// LLM provider interface and fallback chain (reanimator.md section 6). SERVER-SIDE ONLY.
//
// Integrity: there is no mock or canned provider here. If no real provider answers, generate()
// throws AllProvidersFailedError. Callers must never substitute a made-up result.
import { loadLLMConfig } from './config';
import type { Env, ProviderSettings } from './config';
import { createGeminiProvider } from './gemini';
import { createGroqProvider } from './groq';
import { createMistralProvider } from './mistral';
import { redact } from './http';
import { ProviderError } from './types';
import type { FetchLike, GenerateInput, LLMProvider, ProviderFailure } from './types';

export type { FetchLike, GenerateInput, LLMProvider, ProviderFailure, ProviderName } from './types';
export { ProviderError } from './types';

export const GHOST_RESTING_MESSAGE = 'The ghost is resting. Try the gallery.';

/** A provider that was not tried, and why. Never an error. */
export interface SkippedProvider {
  provider: string;
  reason: string;
}

export interface GenerateSuccess {
  text: string;
  /** Name of the provider that served the response. */
  provider: string;
  /** Providers that failed before this one, in order, with reasons. */
  failures: ProviderFailure[];
  skipped: SkippedProvider[];
}

/** Thrown when no provider produced a response. `message` is safe to show to the user. */
export class AllProvidersFailedError extends Error {
  readonly failures: ProviderFailure[];
  readonly skipped: SkippedProvider[];
  constructor(failures: ProviderFailure[], skipped: SkippedProvider[]) {
    super(GHOST_RESTING_MESSAGE);
    this.name = 'AllProvidersFailedError';
    this.failures = failures;
    this.skipped = skipped;
  }
}

export interface ProviderChain {
  /** Providers in try order (only those that have a key and a model). */
  readonly providers: readonly LLMProvider[];
  generate(input: GenerateInput): Promise<GenerateSuccess>;
}

export interface ChainOptions {
  fetchFn?: FetchLike;
  timeoutMs?: number;
}

type Entry = { name: string; provider?: LLMProvider; failure?: ProviderFailure };

function build(settings: ProviderSettings, options: ChainOptions): LLMProvider {
  const opts = {
    apiKey: settings.apiKey as string,
    model: settings.model as string,
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs,
  };
  switch (settings.name) {
    case 'gemini':
      return createGeminiProvider(opts);
    case 'mistral':
      return createMistralProvider(opts);
    case 'groq':
      return createGroqProvider(opts);
  }
}

/** Build the chain from environment variables (pass process.env on the server). */
export function createProviderChain(env: Env, options: ChainOptions = {}): ProviderChain {
  const config = loadLLMConfig(env);
  const skipped: SkippedProvider[] = [];
  const entries: Entry[] = [];
  for (const s of config.order) {
    if (!s.apiKey) {
      skipped.push({ provider: s.name, reason: `${s.keyVar} is not set` });
    } else if (!s.model) {
      entries.push({
        name: s.name,
        failure: { provider: s.name, reason: `${s.modelVar} is not set`, quota: false },
      });
    } else {
      entries.push({ name: s.name, provider: build(s, options) });
    }
  }
  const secrets = config.order.map((s) => s.apiKey).filter((k): k is string => Boolean(k));
  const scrub = (text: string) => secrets.reduce((acc, k) => redact(acc, k), text);

  return {
    providers: entries.flatMap((e) => (e.provider ? [e.provider] : [])),
    async generate(input: GenerateInput): Promise<GenerateSuccess> {
      const failures: ProviderFailure[] = [];
      for (const entry of entries) {
        if (!entry.provider) {
          failures.push(entry.failure as ProviderFailure);
          continue;
        }
        try {
          const text = await entry.provider.generate(input);
          return { text, provider: entry.name, failures, skipped: [...skipped] };
        } catch (err) {
          if (err instanceof ProviderError) {
            failures.push({
              provider: entry.name,
              reason: scrub(err.message),
              ...(err.status !== undefined ? { status: err.status } : {}),
              quota: err.quota,
            });
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            failures.push({ provider: entry.name, reason: scrub(`unexpected error: ${msg}`), quota: false });
          }
        }
      }
      throw new AllProvidersFailedError(failures, [...skipped]);
    },
  };
}
