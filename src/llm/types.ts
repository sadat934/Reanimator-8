// Shared types for the LLM provider layer (reanimator.md section 6).

export interface GenerateInput {
  system: string;
  user: string;
  maxTokens: number;
}

/** Exactly the interface from section 6. Each provider talks to one vendor over HTTP. */
export interface LLMProvider {
  name: string;
  generate(input: GenerateInput): Promise<string>;
}

export type ProviderName = 'gemini' | 'mistral' | 'groq';

/** A single failed attempt. `reason` never contains an API key. */
export interface ProviderFailure {
  provider: string;
  reason: string;
  /** HTTP status when the failure was an HTTP response. */
  status?: number;
  /** True for HTTP 429 or a quota/rate-limit error body. */
  quota: boolean;
}

/** Thrown by a single provider. The chain converts it into a ProviderFailure. */
export class ProviderError extends Error {
  readonly status: number | undefined;
  readonly quota: boolean;
  constructor(message: string, options: { status?: number; quota?: boolean } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = options.status;
    this.quota = options.quota ?? false;
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ProviderOptions {
  apiKey: string;
  model: string;
  /** Defaults to the global fetch, looked up at call time. */
  fetchFn?: FetchLike;
  timeoutMs?: number;
}
