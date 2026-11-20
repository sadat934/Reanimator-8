// Contract between the browser and the generate endpoint (see docs/API.md).
// Browser-safe: type-only imports from server modules, no Node APIs, no keys.
import type { HarnessReport } from '../harness/headless';
import type { ProgressEvent } from '../loop/reanimate';

export type { HarnessReport, ProgressEvent };

export const GENERATE_PATH = '/api/generate';
export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';
/** Same value as MAX_USER_CHARS in src/llm/prompt.ts (a test pins the equality). */
export const MAX_PROMPT_CHARS = 200;
/** Largest request body the endpoint accepts, in bytes. */
export const MAX_BODY_BYTES = 2048;

export interface GenerateRequest {
  prompt: string;
}

export interface GenerateSuccessBody {
  ok: true;
  source: string;
  /** The ROM bytes, base64 encoded. */
  romBase64: string;
  report: HarnessReport;
  provider: string;
  attempts: number;
  /** True when an offline stand-in answered. It must be shown as such. */
  offline: boolean;
  origin: string;
  log: ProgressEvent[];
}

export interface GenerateFailureBody {
  ok: false;
  message: string;
  attempts: number;
  lastProblem: string;
  lastSource: string | null;
  provider: string | null;
  offline: boolean;
  log: ProgressEvent[];
}

export type GenerateResultBody = GenerateSuccessBody | GenerateFailureBody;

export type StreamLine =
  | { type: 'progress'; event: ProgressEvent }
  | { type: 'result'; result: GenerateResultBody }
  | { type: 'error'; message: string };

const CHUNK = 0x8000;

/** Encodes bytes as base64 using btoa, in chunks so large inputs do not overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes base64 to bytes. Throws if the input is not valid base64. */
export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
