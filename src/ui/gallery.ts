// Gallery entries: pre-generated games shipped as gallery/*.json (schema in gallery/README.md).
// Pure parsing and description, no DOM and no network. The entries are loaded by gallery-data.ts.
import { MAX_ROM_SIZE } from '../emulator/types';
import { base64ToBytes } from '../shared/api';
import { labelFor } from './labels';

export interface GalleryEntry {
  title: string;
  prompt: string;
  source: string;
  romBase64: string;
  /** Optional honesty note shown next to the label, for example for placeholders. */
  note?: string;
}

export interface GalleryLoad {
  entries: GalleryEntry[];
  errors: string[];
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function text(record: Record<string, unknown>, field: string, allowEmpty = false): string {
  const value = record[field];
  if (typeof value !== 'string') throw new Error(`"${field}" must be a string`);
  if (!allowEmpty && value.trim() === '') throw new Error(`"${field}" must not be empty`);
  return value;
}

/** Validates one gallery JSON value. Throws an Error that names the bad field. */
export function parseGalleryEntry(value: unknown): GalleryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('gallery entry must be an object');
  }
  const record = value as Record<string, unknown>;
  const title = text(record, 'title');
  const prompt = text(record, 'prompt');
  const source = text(record, 'source');
  const romBase64 = text(record, 'romBase64');
  if (!BASE64.test(romBase64)) throw new Error('"romBase64" is not valid base64');
  const size = base64ToBytes(romBase64).length;
  if (size === 0 || size > MAX_ROM_SIZE) {
    throw new Error(`"romBase64" decodes to ${size} bytes, expected 1 to ${MAX_ROM_SIZE}`);
  }
  const entry: GalleryEntry = { title, prompt, source, romBase64 };
  if (record.note !== undefined) entry.note = text(record, 'note');
  return entry;
}

/** Parses every module (file path to JSON value), sorted by file name. Invalid files are reported, not thrown. */
export function loadGallery(modules: Record<string, unknown>): GalleryLoad {
  const entries: GalleryEntry[] = [];
  const errors: string[] = [];
  for (const name of Object.keys(modules).sort()) {
    try {
      entries.push(parseGalleryEntry(modules[name]));
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { entries, errors };
}

export function describeEntry(entry: GalleryEntry): { title: string; label: string; note: string | null } {
  return { title: entry.title, label: labelFor({ kind: 'gallery' }), note: entry.note ?? null };
}
