// Framework-free handler for POST /api/generate (see docs/API.md). SERVER-SIDE ONLY.
// Runs the real reanimate loop with the provider chain and streams NDJSON lines.
// Keys come from `env` and never reach the output: every line is scrubbed before it is written.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createProviderChain } from '../../src/llm';
import type { ChainOptions, Env } from '../../src/llm';
import { reanimate } from '../../src/loop/reanimate';
import type { ProgressEvent, ReanimateResult } from '../../src/loop/reanimate';
import { MAX_BODY_BYTES, NDJSON_CONTENT_TYPE, bytesToBase64 } from '../../src/shared/api';
import type { GenerateResultBody, StreamLine } from '../../src/shared/api';

export interface GenerateHandlerOptions {
  env: Env;
  /** Passed to createProviderChain. Tests inject a fake fetch here. */
  chainOptions?: ChainOptions;
  /** Pause before each progress line after the first. Defaults to env.DEV_API_DELAY_MS, else 0. */
  delayMs?: number;
}

export type GenerateHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const GENERIC_ERROR = 'Something went wrong on the server. Try again.';

function sendJson(res: ServerResponse, status: number, body: { error: string }, extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...extra });
  res.end(JSON.stringify(body));
}

type BodyResult = { ok: true; text: string } | { ok: false; tooLarge: true };

async function readBody(req: IncomingMessage): Promise<BodyResult> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, tooLarge: true };
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY_BYTES) return { ok: false, tooLarge: true };
    chunks.push(buf);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

function parsePrompt(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null && 'prompt' in value) {
      const prompt = (value as { prompt: unknown }).prompt;
      if (typeof prompt === 'string') return prompt;
    }
  } catch {
    // fall through: invalid JSON is a 400
  }
  return null;
}

function toResultBody(result: ReanimateResult): GenerateResultBody {
  if (result.ok) {
    return {
      ok: true,
      source: result.source,
      romBase64: bytesToBase64(result.rom),
      report: result.report,
      provider: result.provider,
      attempts: result.attempts,
      offline: result.offline,
      origin: result.origin,
      log: result.log,
    };
  }
  return {
    ok: false,
    message: result.message,
    attempts: result.attempts,
    lastProblem: result.lastProblem,
    lastSource: result.lastSource,
    provider: result.provider,
    offline: result.offline,
    log: result.log,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function resolveDelay(options: GenerateHandlerOptions): number {
  const value = options.delayMs ?? Number(options.env.DEV_API_DELAY_MS ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 5000) : 0;
}

/** Secret values to remove from every outgoing line: any non-empty *_API_KEY in env. */
function secretsOf(env: Env): string[] {
  return Object.entries(env)
    .filter(([name, value]) => /_API_KEY$/i.test(name) && typeof value === 'string' && value !== '')
    .map(([, value]) => value as string);
}

export function createGenerateHandler(options: GenerateHandlerOptions): GenerateHandler {
  const delayMs = resolveDelay(options);
  const secrets = secretsOf(options.env);
  const scrub = (text: string): string => secrets.reduce((acc, key) => acc.split(key).join('[redacted]'), text);

  return async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Use POST.' }, { Allow: 'POST' });
      return;
    }
    const body = await readBody(req);
    if (!body.ok) {
      sendJson(res, 413, { error: `Request body is larger than ${MAX_BODY_BYTES} bytes.` }, { Connection: 'close' });
      return;
    }
    const prompt = parsePrompt(body.text);
    if (prompt === null) {
      sendJson(res, 400, { error: 'Send JSON like {"prompt": "a bouncing ball"}.' });
      return;
    }

    let closed = false;
    res.on('close', () => {
      closed = true;
    });
    const write = (line: StreamLine): void => {
      if (closed || res.writableEnded) return;
      res.write(`${scrub(JSON.stringify(line))}\n`);
    };

    res.writeHead(200, { 'Content-Type': NDJSON_CONTENT_TYPE, 'Cache-Control': 'no-cache' });
    res.flushHeaders();

    // reanimate reports progress synchronously, so lines are queued to allow the optional delay.
    let queue: Promise<void> = Promise.resolve();
    let sent = 0;
    const onProgress = (event: ProgressEvent): void => {
      const first = sent++ === 0;
      queue = queue.then(async () => {
        if (!first && delayMs > 0) await sleep(delayMs);
        write({ type: 'progress', event });
      });
    };

    try {
      const chain = createProviderChain(options.env, options.chainOptions);
      const result = await reanimate(prompt, { provider: chain, onProgress });
      await queue;
      write({ type: 'result', result: toResultBody(result) });
    } catch {
      // The raw error text could contain request details, so only a generic message is sent.
      await queue.catch(() => undefined);
      write({ type: 'error', message: GENERIC_ERROR });
    }
    if (!res.writableEnded) res.end();
  };
}
