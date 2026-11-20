import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile';
import { runHeadless } from '../../src/harness/headless';
import { base64ToBytes, bytesToBase64 } from '../../src/shared/api';
import { describeEntry, loadGallery, parseGalleryEntry } from '../../src/ui/gallery';

const valid = { title: 'Bounce', prompt: 'a ball', source: ': main\n', romBase64: 'YWJj' };

describe('parseGalleryEntry', () => {
  it('parses a valid entry and keeps an optional note', () => {
    expect(parseGalleryEntry(valid)).toEqual(valid);
    expect(parseGalleryEntry({ ...valid, note: 'hello' }).note).toBe('hello');
  });

  it('rejects non-objects', () => {
    for (const bad of [null, 'text', 5, [valid], undefined]) {
      expect(() => parseGalleryEntry(bad)).toThrow('must be an object');
    }
  });

  it('rejects a missing, ill-typed or empty field and names it', () => {
    for (const field of ['title', 'prompt', 'source', 'romBase64']) {
      const missing: Record<string, unknown> = { ...valid };
      delete missing[field];
      expect(() => parseGalleryEntry(missing)).toThrow(`"${field}" must be a string`);
      expect(() => parseGalleryEntry({ ...valid, [field]: 7 })).toThrow(`"${field}" must be a string`);
      expect(() => parseGalleryEntry({ ...valid, [field]: '  ' })).toThrow(`"${field}" must not be empty`);
    }
  });

  it('rejects a note that is not a string', () => {
    expect(() => parseGalleryEntry({ ...valid, note: 3 })).toThrow('"note" must be a string');
  });

  it('rejects a romBase64 that is not base64', () => {
    expect(() => parseGalleryEntry({ ...valid, romBase64: 'not base64!' })).toThrow('not valid base64');
    expect(() => parseGalleryEntry({ ...valid, romBase64: 'YWJ' })).toThrow('not valid base64');
  });

  it('rejects a ROM that decodes to 0 or more than 3584 bytes', () => {
    expect(() => parseGalleryEntry({ ...valid, romBase64: bytesToBase64(new Uint8Array(3585)) })).toThrow('3585 bytes');
    expect(() => parseGalleryEntry({ ...valid, romBase64: bytesToBase64(new Uint8Array(3584)) })).not.toThrow();
  });
});

describe('loadGallery', () => {
  it('keeps valid entries sorted by file name and reports invalid ones', () => {
    const result = loadGallery({
      '/gallery/b.json': { ...valid, title: 'B' },
      '/gallery/bad.json': { title: 'x' },
      '/gallery/a.json': { ...valid, title: 'A' },
    });
    expect(result.entries.map((e) => e.title)).toEqual(['A', 'B']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('/gallery/bad.json');
  });
});

describe('describeEntry', () => {
  it('labels every entry pre-generated and passes the note through', () => {
    expect(describeEntry(valid)).toEqual({ title: 'Bounce', label: 'pre-generated', note: null });
    expect(describeEntry({ ...valid, note: 'n' }).note).toBe('n');
  });
});

describe('gallery/*.json files', () => {
  const files = readdirSync('gallery').filter((f) => f.endsWith('.json'));

  it('has at least the placeholder entries', () => {
    expect(files).toEqual(expect.arrayContaining(['placeholder-bounce.json', 'placeholder-catch.json']));
  });

  for (const file of files) {
    it(`${file} parses, matches compile(source) and passes the headless harness`, () => {
      const entry = parseGalleryEntry(JSON.parse(readFileSync(`gallery/${file}`, 'utf8')));
      const compiled = compile(entry.source);
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      expect(entry.romBase64).toBe(bytesToBase64(compiled.rom));
      expect(runHeadless(base64ToBytes(entry.romBase64)).passed).toBe(true);
    });
  }

  it('titles every placeholder "[placeholder]" and gives it a note', () => {
    for (const file of files.filter((f) => f.startsWith('placeholder-'))) {
      const entry = parseGalleryEntry(JSON.parse(readFileSync(`gallery/${file}`, 'utf8')));
      expect(entry.title.startsWith('[placeholder]')).toBe(true);
      expect(entry.note).toContain('not LLM output');
    }
  });
});
