// Shared HTTP helper for providers. Server-side only: it receives API keys.
import { ProviderError } from './types';
import type { FetchLike, ProviderOptions } from './types';

export const DEFAULT_TIMEOUT_MS = 60_000;
const BODY_SNIPPET_CHARS = 200;
const QUOTA_PATTERN = /quota|rate.?limit|resource_exhausted|too many requests/i;

/** Replace every occurrence of the key so it can never reach an error message or a log. */
export function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join('[redacted]') : text;
}

export async function postJson(
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  options: ProviderOptions,
): Promise<unknown> {
  const fetchFn: FetchLike = options.fetchFn ?? ((u, i) => fetch(u, i));
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new ProviderError(`${provider} network error: ${redact(msg, options.apiKey)}`);
  }

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    const snippet = redact(text, options.apiKey).replace(/\s+/g, ' ').slice(0, BODY_SNIPPET_CHARS);
    const quota = response.status === 429 || QUOTA_PATTERN.test(text);
    throw new ProviderError(
      `${provider} HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`,
      { status: response.status, quota },
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(`${provider} returned a response that is not JSON`, { status: response.status });
  }
}
