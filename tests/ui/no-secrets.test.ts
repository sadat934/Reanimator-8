import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** All files under src/ui plus src/main.ts: the code that ships to the browser as the UI. */
function uiFiles(dir = 'src/ui'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name).replace(/\\/g, '/');
    if (statSync(path).isDirectory()) out.push(...uiFiles(path));
    else out.push(path);
  }
  return dir === 'src/ui' ? [...out, 'src/main.ts'] : out;
}

function importsOf(text: string): string[] {
  const found: string[] = [];
  for (const re of [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s+['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]/g]) {
    for (const m of text.matchAll(re)) found.push(m[1] as string);
  }
  return found;
}

const BANNED_DIR = /(^|\/)(llm|loop|compiler)(\/|$)/;
const nodeBuiltins = new Set(builtinModules);
const files = uiFiles();

describe('browser code stays free of server code and secrets', () => {
  it('finds the files it is meant to check', () => {
    expect(files).toEqual(expect.arrayContaining(['src/main.ts', 'src/ui/keymap.ts', 'src/ui/state.ts']));
  });

  for (const file of files) {
    it(`${file} imports no src/llm, src/loop, src/compiler or node modules`, () => {
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(BANNED_DIR);
        expect(spec.startsWith('node:'), `${file} imports ${spec}`).toBe(false);
        expect(nodeBuiltins.has(spec), `${file} imports ${spec}`).toBe(false);
      }
    });

    it(`${file} does not read process.env or key variables`, () => {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/process\.env/);
      expect(text).not.toMatch(/import\.meta\.env\.[A-Za-z_]*KEY/);
    });
  }

  it('src/shared only imports server modules as types', () => {
    const text = readFileSync('src/shared/api.ts', 'utf8');
    const lines = text.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/^import type\b/);
  });
});
