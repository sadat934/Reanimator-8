import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile';
import { runHeadless } from '../../src/harness/headless';

// Vite inlines every examples/*.8o as a string at transform time.
const sources = (import.meta as unknown as {
  glob: (pattern: string, opts: { query: string; import: string; eager: boolean }) => Record<string, string>;
}).glob('../../examples/*.8o', { query: '?raw', import: 'default', eager: true });
const files = Object.keys(sources).sort();

describe('examples/*.8o', () => {
  it('has at least four examples', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    it(`${file} compiles and passes the headless harness`, () => {
      const result = compile(sources[file] ?? '');
      if (!result.ok) throw new Error(result.errors.map((e) => `line ${e.line}: ${e.message}`).join('; '));
      const report = runHeadless(result.rom);
      expect(report.failures).toEqual([]);
      expect(report.passed).toBe(true);
    });
  }
});
