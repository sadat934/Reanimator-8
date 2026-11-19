import { describe, expect, it, vi } from 'vitest';
import { AllProvidersFailedError, createProviderChain, GHOST_RESTING_MESSAGE } from '../../src/llm';
import type { FetchLike } from '../../src/llm';
import { GEMINI_BASE_URL } from '../../src/llm/gemini';
import { MISTRAL_URL } from '../../src/llm/mistral';
import { GROQ_URL } from '../../src/llm/groq';

const INPUT = { system: 'SYS', user: 'USER', maxTokens: 123 };
const KEYS = { GEMINI_API_KEY: 'gem-secret-111', MISTRAL_API_KEY: 'mis-secret-222', GROQ_API_KEY: 'grq-secret-333' };
const MODELS = { GEMINI_MODEL: 'gem-model', MISTRAL_MODEL: 'mis-model', GROQ_MODEL: 'grq-model' };
const FULL_ENV = { ...KEYS, ...MODELS };

const geminiOk = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const chatOk = (text: string) => ({ choices: [{ message: { content: text } }] });

function json(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

/** Mock fetch routed by URL. Each handler returns a Response or throws. */
function routedFetch(routes: { gemini?: () => Response; mistral?: () => Response; groq?: () => Response }) {
  const fn = vi.fn<FetchLike>(async (url) => {
    if (url.startsWith(GEMINI_BASE_URL)) return (routes.gemini ?? (() => json(500, 'unrouted')))();
    if (url === MISTRAL_URL) return (routes.mistral ?? (() => json(500, 'unrouted')))();
    if (url === GROQ_URL) return (routes.groq ?? (() => json(500, 'unrouted')))();
    throw new Error(`unexpected URL ${url}`);
  });
  return fn;
}

const calledUrls = (f: ReturnType<typeof routedFetch>) => f.mock.calls.map((c) => c[0]);

describe('request and response shapes', () => {
  it('gemini: header key, systemInstruction, maxOutputTokens, parses candidates', async () => {
    const f = routedFetch({ gemini: () => json(200, geminiOk('gem text')) });
    const chain = createProviderChain(FULL_ENV, { fetchFn: f });
    const r = await chain.generate(INPUT);
    expect(r.text).toBe('gem text');
    expect(r.provider).toBe('gemini');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`${GEMINI_BASE_URL}/gem-model:generateContent`);
    expect(url).not.toContain(KEYS.GEMINI_API_KEY);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEYS.GEMINI_API_KEY);
    expect(JSON.parse(init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      contents: [{ role: 'user', parts: [{ text: 'USER' }] }],
      generationConfig: { maxOutputTokens: 123 },
    });
  });

  it('gemini: joins several parts', async () => {
    const f = routedFetch({
      gemini: () => json(200, { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }),
    });
    const r = await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT);
    expect(r.text).toBe('ab');
  });

  it('mistral: bearer key, chat body, max_tokens, parses choices', async () => {
    const f = routedFetch({ mistral: () => json(200, chatOk('mis text')) });
    const r = await createProviderChain({ ...FULL_ENV, LLM_PROVIDER: 'mistral' }, { fetchFn: f }).generate(INPUT);
    expect(r.text).toBe('mis text');
    expect(r.provider).toBe('mistral');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(MISTRAL_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEYS.MISTRAL_API_KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'mis-model',
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' },
      ],
      max_tokens: 123,
    });
  });

  it('groq: bearer key, chat body, max_completion_tokens, parses choices', async () => {
    const f = routedFetch({ groq: () => json(200, chatOk('grq text')) });
    const r = await createProviderChain({ ...FULL_ENV, LLM_PROVIDER: 'groq' }, { fetchFn: f }).generate(INPUT);
    expect(r.text).toBe('grq text');
    expect(r.provider).toBe('groq');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(GROQ_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEYS.GROQ_API_KEY}`);
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'grq-model',
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' },
      ],
      max_completion_tokens: 123,
    });
  });

  it('treats an empty response as a failure instead of returning empty text', async () => {
    const f = routedFetch({
      gemini: () => json(200, { candidates: [] }),
      mistral: () => json(200, { choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
      groq: () => json(200, chatOk('real')),
    });
    const r = await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT);
    expect(r.provider).toBe('groq');
    expect(r.failures.map((x) => x.provider)).toEqual(['gemini', 'mistral']);
  });
});

describe('fallback', () => {
  it('HTTP 429 falls back and is marked as quota', async () => {
    const f = routedFetch({
      gemini: () => json(429, { error: { message: 'Too many' } }),
      mistral: () => json(200, chatOk('from mistral')),
    });
    const r = await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT);
    expect(r.provider).toBe('mistral');
    expect(r.text).toBe('from mistral');
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({ provider: 'gemini', status: 429, quota: true });
    expect(calledUrls(f)).toHaveLength(2);
  });

  it('a quota error body on a non-429 status falls back and is marked as quota', async () => {
    const f = routedFetch({
      gemini: () => json(403, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }),
      mistral: () => json(200, chatOk('ok')),
    });
    const r = await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT);
    expect(r.failures[0]).toMatchObject({ provider: 'gemini', status: 403, quota: true });
  });

  it('other errors (500, network, bad JSON) also fall through and are recorded', async () => {
    const f = routedFetch({
      gemini: () => json(500, 'boom'),
      mistral: () => {
        throw new TypeError('fetch failed');
      },
      groq: () => json(200, chatOk('last one')),
    });
    const r = await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT);
    expect(r.provider).toBe('groq');
    expect(r.failures).toEqual([
      { provider: 'gemini', reason: 'gemini HTTP 500: boom', status: 500, quota: false },
      { provider: 'mistral', reason: 'mistral network error: TypeError: fetch failed', quota: false },
    ]);

    const g = routedFetch({ gemini: () => json(200, 'not json at all'), mistral: () => json(200, chatOk('x')) });
    const r2 = await createProviderChain(FULL_ENV, { fetchFn: g }).generate(INPUT);
    expect(r2.provider).toBe('mistral');
    expect(r2.failures[0]?.reason).toContain('not JSON');
  });

  it('first provider success makes no further calls and reports no failures', async () => {
    const f = routedFetch({ gemini: () => json(200, geminiOk('first')) });
    const r = await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT);
    expect(r.failures).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('uses the global fetch when no fetchFn is given', async () => {
    const f = vi.fn(async () => json(200, geminiOk('via global')));
    vi.stubGlobal('fetch', f);
    try {
      const r = await createProviderChain(FULL_ENV).generate(INPUT);
      expect(r.text).toBe('via global');
      expect(f).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('keys, models and ordering', () => {
  it('skips providers without a key and reports them as skipped, not failed', async () => {
    const f = routedFetch({ groq: () => json(200, chatOk('only groq')) });
    const env = { GROQ_API_KEY: KEYS.GROQ_API_KEY, GROQ_MODEL: 'grq-model' };
    const r = await createProviderChain(env, { fetchFn: f }).generate(INPUT);
    expect(r.provider).toBe('groq');
    expect(r.failures).toEqual([]);
    expect(r.skipped.map((s) => s.provider)).toEqual(['gemini', 'mistral']);
    expect(calledUrls(f)).toEqual([GROQ_URL]);
  });

  it('treats a blank key as missing', async () => {
    const f = routedFetch({ groq: () => json(200, chatOk('ok')) });
    const env = { ...FULL_ENV, GEMINI_API_KEY: '   ', MISTRAL_API_KEY: '' };
    const r = await createProviderChain(env, { fetchFn: f }).generate(INPUT);
    expect(r.skipped.map((s) => s.provider)).toEqual(['gemini', 'mistral']);
    expect(r.provider).toBe('groq');
  });

  it('LLM_PROVIDER picks the primary, the rest follow in default order', async () => {
    const f = routedFetch({
      groq: () => json(500, 'x'),
      gemini: () => json(500, 'x'),
      mistral: () => json(200, chatOk('m')),
    });
    const r = await createProviderChain({ ...FULL_ENV, LLM_PROVIDER: 'groq' }, { fetchFn: f }).generate(INPUT);
    expect(calledUrls(f)).toEqual([GROQ_URL, `${GEMINI_BASE_URL}/gem-model:generateContent`, MISTRAL_URL]);
    expect(r.failures.map((x) => x.provider)).toEqual(['groq', 'gemini']);
  });

  it('LLM_PROVIDER is case-insensitive; an unknown value falls back to the default order', () => {
    const names = (env: Record<string, string>) => createProviderChain(env).providers.map((p) => p.name);
    expect(names({ ...FULL_ENV, LLM_PROVIDER: 'Mistral' })).toEqual(['mistral', 'gemini', 'groq']);
    expect(names({ ...FULL_ENV, LLM_PROVIDER: 'nonsense' })).toEqual(['gemini', 'mistral', 'groq']);
    expect(names(FULL_ENV)).toEqual(['gemini', 'mistral', 'groq']);
  });

  it('a key without a model is a recorded failure and does not call the network', async () => {
    const f = routedFetch({ mistral: () => json(200, chatOk('ok')) });
    const env = { ...FULL_ENV, GEMINI_MODEL: '' };
    const r = await createProviderChain(env, { fetchFn: f }).generate(INPUT);
    expect(r.failures).toEqual([{ provider: 'gemini', reason: 'GEMINI_MODEL is not set', quota: false }]);
    expect(calledUrls(f)).toEqual([MISTRAL_URL]);
  });
});

describe('total failure', () => {
  it('throws the typed error with the friendly message and the failure list', async () => {
    const f = routedFetch({
      gemini: () => json(429, 'slow down'),
      mistral: () => json(500, 'oops'),
      groq: () => json(401, 'bad key'),
    });
    const err = await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    const e = err as AllProvidersFailedError;
    expect(e.message).toBe('The ghost is resting. Try the gallery.');
    expect(e.message).toBe(GHOST_RESTING_MESSAGE);
    expect(e.failures.map((x) => [x.provider, x.status, x.quota])).toEqual([
      ['gemini', 429, true],
      ['mistral', 500, false],
      ['groq', 401, false],
    ]);
  });

  it('with no keys at all it throws the same error, lists the skips, and never calls fetch', async () => {
    const f = routedFetch({});
    const err = (await createProviderChain({}, { fetchFn: f }).generate(INPUT).catch((e: unknown) => e)) as AllProvidersFailedError;
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect(err.message).toBe(GHOST_RESTING_MESSAGE);
    expect(err.failures).toEqual([]);
    expect(err.skipped.map((s) => s.reason)).toEqual([
      'GEMINI_API_KEY is not set',
      'MISTRAL_API_KEY is not set',
      'GROQ_API_KEY is not set',
    ]);
    expect(f).not.toHaveBeenCalled();
  });

  it('never returns canned text: a failing chain has no success value', async () => {
    const f = routedFetch({ gemini: () => json(500, 'x'), mistral: () => json(500, 'x'), groq: () => json(500, 'x') });
    await expect(createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT)).rejects.toBeInstanceOf(AllProvidersFailedError);
  });
});

describe('secrets never leak', () => {
  it('keys echoed by a provider or a network error are redacted from every failure', async () => {
    const f = routedFetch({
      gemini: () => json(400, { error: { message: `API key not valid: ${KEYS.GEMINI_API_KEY}` } }),
      mistral: () => {
        throw new Error(`connect failed for Bearer ${KEYS.MISTRAL_API_KEY}`);
      },
      groq: () => json(401, `Invalid key ${KEYS.GROQ_API_KEY}`),
    });
    const err = (await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT).catch((e: unknown) => e)) as AllProvidersFailedError;
    const dump = JSON.stringify({ m: err.message, f: err.failures, s: err.skipped, stack: err.stack });
    for (const key of Object.values(KEYS)) expect(dump).not.toContain(key);
    expect(err.failures[0]?.reason).toContain('[redacted]');
  });

  it('a successful result with earlier failures contains no keys', async () => {
    const f = routedFetch({
      gemini: () => json(429, `quota for ${KEYS.GEMINI_API_KEY}`),
      mistral: () => json(200, chatOk('ok')),
    });
    const r = await createProviderChain(FULL_ENV, { fetchFn: f }).generate(INPUT);
    const dump = JSON.stringify({ ...r, text: undefined });
    for (const key of Object.values(KEYS)) expect(dump).not.toContain(key);
  });
});
