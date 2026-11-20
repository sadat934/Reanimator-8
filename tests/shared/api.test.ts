import { describe, expect, it } from 'vitest';
import { MAX_USER_CHARS } from '../../src/llm/prompt';
import {
  GENERATE_PATH,
  MAX_PROMPT_CHARS,
  NDJSON_CONTENT_TYPE,
  base64ToBytes,
  bytesToBase64,
} from '../../src/shared/api';

describe('shared api constants', () => {
  it('MAX_PROMPT_CHARS equals MAX_USER_CHARS from the prompt builder', () => {
    expect(MAX_PROMPT_CHARS).toBe(MAX_USER_CHARS);
  });

  it('uses the documented path and content type', () => {
    expect(GENERATE_PATH).toBe('/api/generate');
    expect(NDJSON_CONTENT_TYPE).toBe('application/x-ndjson');
  });
});

describe('base64 helpers', () => {
  it('round-trips an empty array', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });

  it('round-trips every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips a maximum-size 3584-byte ROM and matches Buffer encoding', () => {
    const bytes = Uint8Array.from({ length: 3584 }, (_, i) => (i * 31 + 7) & 0xff);
    const text = bytesToBase64(bytes);
    expect(text).toBe(Buffer.from(bytes).toString('base64'));
    expect(base64ToBytes(text)).toEqual(bytes);
  });

  it('round-trips input larger than one chunk', () => {
    const bytes = Uint8Array.from({ length: 0x8000 * 2 + 5 }, (_, i) => i & 0xff);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('throws on invalid base64', () => {
    expect(() => base64ToBytes('not base64 !!')).toThrow();
  });
});
