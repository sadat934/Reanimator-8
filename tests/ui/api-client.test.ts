import { describe, expect, it } from 'vitest';
import { GENERATE_PATH } from '../../src/shared/api';
import type { GenerateSuccessBody, StreamLine } from '../../src/shared/api';
import { generate, parseNdjsonStream } from '../../src/ui/api-client';

const encoder = new TextEncoder();

/** A stream that delivers exactly these text chunks, in order. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const collect = async (chunks: string[]): Promise<StreamLine[]> => {
  const lines: StreamLine[] = [];
  await parseNdjsonStream(streamOf(chunks), (l) => lines.push(l));
  return lines;
};

const progress = (message: string): string =>
  JSON.stringify({ type: 'progress', event: { attempt: 1, kind: 'generating', message } });

const okResult: GenerateSuccessBody = {
  ok: true,
  source: 's',
  romBase64: 'AA==',
  report: {} as GenerateSuccessBody['report'],
  provider: 'mock',
  attempts: 1,
  offline: true,
  origin: 'offline stand-in, not generated just now',
  log: [],
};
const resultLine = JSON.stringify({ type: 'result', result: okResult });

describe('parseNdjsonStream', () => {
  it('handles lines split across chunks, even mid-token', () => {
    const text = `${progress('one')}\n${progress('two')}\n`;
    const cut = 25;
    return collect([text.slice(0, cut), text.slice(cut, cut + 40), text.slice(cut + 40)]).then((lines) => {
      expect(lines.map((l) => (l.type === 'progress' ? l.event.message : l.type))).toEqual(['one', 'two']);
    });
  });

  it('handles CRLF endings and blank lines', async () => {
    const lines = await collect([`${progress('a')}\r\n\r\n\n${progress('b')}\r\n`]);
    expect(lines).toHaveLength(2);
  });

  it('handles a final line with no newline', async () => {
    const lines = await collect([`${progress('a')}\n${resultLine}`]);
    expect(lines.map((l) => l.type)).toEqual(['progress', 'result']);
  });

  it('handles multi-byte characters split across chunks', async () => {
    const bytes = encoder.encode(`${progress('né')}\n`);
    const cut = bytes.indexOf(0xc3) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const lines: StreamLine[] = [];
    await parseNdjsonStream(stream, (l) => lines.push(l));
    expect(lines[0]).toMatchObject({ event: { message: 'né' } });
  });

  it('throws Malformed stream line for bad JSON and unknown line types', async () => {
    await expect(collect(['{nope\n'])).rejects.toThrow('Malformed stream line');
    await expect(collect(['{"type":"other"}\n'])).rejects.toThrow('Malformed stream line');
    await expect(collect(['[1]\n'])).rejects.toThrow('Malformed stream line');
  });
});

const respond = (chunks: string[], init: ResponseInit = { status: 200 }) => async () => new Response(streamOf(chunks), init);

describe('generate', () => {
  it('posts the prompt as JSON to the generate path', async () => {
    let seen: { url: string; init: RequestInit | undefined } | null = null;
    await generate('a ball', {
      fetchFn: async (url, init) => {
        seen = { url, init };
        return new Response(streamOf([`${resultLine}\n`]));
      },
    });
    expect(seen).not.toBeNull();
    const s = seen as unknown as { url: string; init: RequestInit };
    expect(s.url).toBe(GENERATE_PATH);
    expect(s.init.method).toBe('POST');
    expect(JSON.parse(String(s.init.body))).toEqual({ prompt: 'a ball' });
  });

  it('calls onProgress per progress line and resolves with the result', async () => {
    const messages: string[] = [];
    const result = await generate('a ball', {
      fetchFn: respond([`${progress('one')}\n${progress('two')}\n${resultLine}\n`]),
      onProgress: (e) => messages.push(e.message),
    });
    expect(messages).toEqual(['one', 'two']);
    expect(result).toEqual(okResult);
  });

  it('maps a non-2xx response to the server error text', async () => {
    const fetchFn = async () => new Response(JSON.stringify({ error: 'Use POST.' }), { status: 405 });
    await expect(generate('x', { fetchFn })).rejects.toThrow('Use POST.');
  });

  it('falls back to HTTP <status> when the error body is not JSON', async () => {
    const fetchFn = async () => new Response('<html>', { status: 502 });
    await expect(generate('x', { fetchFn })).rejects.toThrow('HTTP 502');
  });

  it('throws when the stream ends without a result', async () => {
    await expect(generate('x', { fetchFn: respond([`${progress('one')}\n`]) })).rejects.toThrow('without a result');
  });

  it('throws the message of an error line', async () => {
    const line = JSON.stringify({ type: 'error', message: 'server broke' });
    await expect(generate('x', { fetchFn: respond([`${line}\n`]) })).rejects.toThrow('server broke');
  });

  it('passes the abort signal to fetch', async () => {
    const controller = new AbortController();
    let signal: AbortSignal | null | undefined;
    await generate('x', {
      signal: controller.signal,
      fetchFn: async (_url, init) => {
        signal = init?.signal;
        return new Response(streamOf([`${resultLine}\n`]));
      },
    });
    expect(signal).toBe(controller.signal);
  });
});
