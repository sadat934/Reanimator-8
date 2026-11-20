import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../src/harness/headless';
import { MAX_BODY_BYTES, NDJSON_CONTENT_TYPE, base64ToBytes } from '../../src/shared/api';
import type { StreamLine } from '../../src/shared/api';
import { createGenerateHandler } from '../../tools/dev-api/handler';

interface FakeRes {
  status: number;
  headers: Record<string, string | number | string[]>;
  chunks: string[];
  ended: boolean;
}

/** Minimal ServerResponse stand-in that records what the handler writes. */
function fakeRes(): { res: ServerResponse; out: FakeRes; close: () => void } {
  const out: FakeRes = { status: 0, headers: {}, chunks: [], ended: false };
  let onClose: (() => void) | null = null;
  const res = {
    get writableEnded() {
      return out.ended;
    },
    writeHead(status: number, headers: Record<string, string | number | string[]> = {}) {
      out.status = status;
      out.headers = headers;
      return res;
    },
    flushHeaders() {},
    write(chunk: string) {
      out.chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) out.chunks.push(chunk);
      out.ended = true;
    },
    on(event: string, cb: () => void) {
      if (event === 'close') onClose = cb;
      return res;
    },
  };
  return { res: res as unknown as ServerResponse, out, close: () => onClose?.() };
}

function fakeReq(method: string, body: string | Buffer = ''): IncomingMessage {
  const stream = Readable.from(body.length > 0 ? [Buffer.from(body)] : []) as unknown as IncomingMessage;
  stream.method = method;
  stream.headers = {};
  return stream;
}

async function call(
  method: string,
  body: string,
  options: Parameters<typeof createGenerateHandler>[0] = { env: {} },
): Promise<{ status: number; headers: FakeRes['headers']; text: string; lines: StreamLine[] }> {
  const { res, out } = fakeRes();
  await createGenerateHandler(options)(fakeReq(method, body), res);
  const text = out.chunks.join('');
  const lines = out.status === 200 ? text.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as StreamLine) : [];
  return { status: out.status, headers: out.headers, text, lines };
}

const post = (prompt: unknown, options?: Parameters<typeof createGenerateHandler>[0]) =>
  call('POST', JSON.stringify({ prompt }), options);

describe('dev API handler', () => {
  it('streams progress lines then an offline mock result that passes the headless harness', async () => {
    const r = await post('a bouncing ball');
    expect(r.status).toBe(200);
    expect(r.headers['Content-Type']).toBe(NDJSON_CONTENT_TYPE);
    const progress = r.lines.filter((l) => l.type === 'progress');
    expect(progress.length).toBeGreaterThanOrEqual(3);
    const last = r.lines[r.lines.length - 1];
    expect(last?.type).toBe('result');
    if (last?.type !== 'result' || !last.result.ok) throw new Error('expected a successful result');
    expect(last.result.provider).toBe('mock');
    expect(last.result.offline).toBe(true);
    expect(last.result.origin).toBe('offline stand-in, not generated just now');
    expect(last.result.log.length).toBe(progress.length);
    expect(runHeadless(base64ToBytes(last.result.romBase64)).passed).toBe(true);
    // every line before the result is a progress line
    expect(r.lines.slice(0, -1).every((l) => l.type === 'progress')).toBe(true);
  });

  it('answers non-POST methods with 405 and Allow: POST', async () => {
    const r = await call('GET', '');
    expect(r.status).toBe(405);
    expect(r.headers.Allow).toBe('POST');
  });

  it('answers 400 for bad JSON, a missing prompt and a non-string prompt', async () => {
    expect((await call('POST', '{nope')).status).toBe(400);
    expect((await call('POST', '{}')).status).toBe(400);
    expect((await call('POST', 'null')).status).toBe(400);
    expect((await post(42)).status).toBe(400);
  });

  it('answers 413 when the body is over 2048 bytes', async () => {
    const r = await call('POST', JSON.stringify({ prompt: 'x'.repeat(MAX_BODY_BYTES) }));
    expect(r.status).toBe(413);
  });

  it('accepts a body of exactly 2048 bytes', async () => {
    const pad = MAX_BODY_BYTES - JSON.stringify({ prompt: '' }).length;
    const r = await post('x'.repeat(pad));
    expect(r.status).toBe(200);
  });

  it('never streams a key, even when a provider fails with 429 and echoes it', async () => {
    const key = 'sk-test-secret';
    const fetchFn = async () => new Response(`rate limit exceeded for key ${key}`, { status: 429 });
    const r = await post('a bouncing ball', {
      env: { GEMINI_API_KEY: key, GEMINI_MODEL: 'test-model' },
      chainOptions: { fetchFn },
    });
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(key);
    const last = r.lines[r.lines.length - 1];
    expect(last?.type === 'result' && last.result.ok && last.result.offline).toBe(true);
  });

  it('removes a key from a line even if one slips into model output', async () => {
    const key = 'sk-test-secret';
    const mockProvider = { name: 'mock', offline: true, generate: async () => ': main\n  ' + key + '\n' };
    const r = await post('a bouncing ball', { env: { GROQ_API_KEY: key }, chainOptions: { mockProvider } });
    expect(r.text).not.toContain(key);
    expect(r.text).toContain('[redacted]');
  });

  it('returns a result with ok: false for an empty prompt', async () => {
    const r = await post('   ');
    expect(r.status).toBe(200);
    const last = r.lines[r.lines.length - 1];
    expect(last?.type).toBe('result');
    if (last?.type === 'result') {
      expect(last.result.ok).toBe(false);
      if (!last.result.ok) expect(last.result.lastSource).toBeNull();
    }
  });

  it('honors the delay between progress lines and still ends with a result', async () => {
    const started = Date.now();
    const r = await post('a bouncing ball', { env: {}, delayMs: 20 });
    const progress = r.lines.filter((l) => l.type === 'progress').length;
    expect(Date.now() - started).toBeGreaterThanOrEqual((progress - 1) * 20 - 5);
    expect(r.lines[r.lines.length - 1]?.type).toBe('result');
  });

  it('stops writing after the client disconnects', async () => {
    const { res, out, close } = fakeRes();
    const handler = createGenerateHandler({ env: {}, delayMs: 30 });
    const pending = handler(fakeReq('POST', JSON.stringify({ prompt: 'a ball' })), res);
    await new Promise((resolve) => setTimeout(resolve, 10));
    close();
    const before = out.chunks.length;
    await pending;
    expect(out.chunks.length).toBe(before);
  });
});
