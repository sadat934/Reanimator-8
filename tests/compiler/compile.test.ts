import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile';

describe('compile (vendored Octo wrapper)', () => {
  it('compiles a small program to ROM bytes', () => {
    const r = compile(': main\n  v0 := 5\n  loop again\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rom).toBeInstanceOf(Uint8Array);
    // A leading `: main` drops Octo's reserved jump slot: v0 := 5, then jump 0x202 (the loop).
    expect(Array.from(r.rom)).toEqual([0x60, 0x05, 0x12, 0x02]);
  });

  it('is deterministic', () => {
    const src = ': main\n  v0 := 1\n  loop again\n';
    expect(compile(src)).toEqual(compile(src));
  });

  it('reports an unknown token with its 1-based line number', () => {
    const r = compile(': main\n  v0 := 1\n  v1 := oops\n  loop again\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.line).toBe(3);
    expect(r.errors[0]?.message).toContain('oops');
  });

  it('reports a line number on the first line too', () => {
    const r = compile('v0 := nonsense\n: main\n  loop again\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.line).toBe(1);
  });

  it('reports a missing main label', () => {
    const r = compile(': start\n  loop again\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.message).toContain("missing a 'main' label");
    expect(r.errors[0]?.line).toBe(3);
  });

  it('reports an unmatched loop at the line of the loop', () => {
    const r = compile(': main\n  v0 := 1\n  loop\n  v0 += 1\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.message).toContain("does not have a matching 'again'");
    expect(r.errors[0]?.line).toBe(3);
  });

  it('rejects SUPER-CHIP instructions with no line number', () => {
    const r = compile(': main\n  hires\n  loop again\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.message).toContain('SUPER-CHIP');
    expect(r.errors[0]?.line).toBeNull();
  });

  it('rejects a ROM larger than program memory', () => {
    const r = compile(': main\n  loop again\n: big\n' + '0 '.repeat(3600));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.message).toContain('too large');
  });

  it('never throws on garbage input', () => {
    expect(() => compile('"unterminated')).not.toThrow();
    expect(compile('"unterminated').ok).toBe(false);
  });
});
