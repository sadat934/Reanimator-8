// Browser client for POST /api/generate (see docs/API.md). Never touches keys or server code.
import { GENERATE_PATH, NDJSON_CONTENT_TYPE } from '../shared/api';
import type { GenerateResultBody, ProgressEvent, StreamLine } from '../shared/api';

export const MALFORMED_LINE = 'Malformed stream line';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function parseLine(text: string): StreamLine {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(MALFORMED_LINE);
  }
  const type = typeof value === 'object' && value !== null ? (value as { type?: unknown }).type : undefined;
  if (type !== 'progress' && type !== 'result' && type !== 'error') throw new Error(MALFORMED_LINE);
  return value as StreamLine;
}

/** Reads an NDJSON body and calls onLine for each non-blank line, in order. */
export async function parseNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onLine: (line: StreamLine) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flushLine = (raw: string): void => {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (text.trim() !== '') onLine(parseLine(text));
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      flushLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  flushLine(buffer);
}

export interface GenerateOptions {
  fetchFn?: FetchFn;
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
}

async function errorFromResponse(response: Response): Promise<Error> {
  try {
    const data: unknown = await response.json();
    const text = typeof data === 'object' && data !== null ? (data as { error?: unknown }).error : undefined;
    if (typeof text === 'string' && text !== '') return new Error(text);
  } catch {
    // not JSON: fall through to the status text
  }
  return new Error(`HTTP ${response.status}`);
}

/** Sends the prompt and resolves with the final result line. Rejects on transport or stream errors. */
export async function generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResultBody> {
  const fetchFn: FetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: NDJSON_CONTENT_TYPE },
    body: JSON.stringify({ prompt }),
  };
  if (options.signal) init.signal = options.signal;
  const response = await fetchFn(GENERATE_PATH, init);
  if (!response.ok) throw await errorFromResponse(response);
  if (response.body === null) throw new Error('The server sent no stream');

  let result: GenerateResultBody | null = null;
  await parseNdjsonStream(response.body, (line) => {
    if (line.type === 'progress') options.onProgress?.(line.event);
    else if (line.type === 'result') result = line.result;
    else throw new Error(line.message);
  });
  if (result === null) throw new Error('The stream ended without a result');
  return result;
}
