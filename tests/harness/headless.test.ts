import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile';
import { KEY_SEQUENCE, runHeadless } from '../../src/harness/headless';
import { rom } from '../helpers';

const octo = (source: string): Uint8Array => {
  const r = compile(source);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
  return r.rom;
};

// Passing: a sprite that moves one pixel every frame.
const MOVING = `
: main
  v0 := 0
  i := dot
  loop
    sprite v0 v1 1
    sprite v0 v1 1
    v0 += 1
    sprite v0 v1 1
    vf := 0
    delay := vf
  again
: dot 0x80
`;

describe('runHeadless', () => {
  it('uses the 16 keys in the documented order', () => {
    expect(KEY_SEQUENCE).toHaveLength(16);
    expect(new Set(KEY_SEQUENCE).size).toBe(16);
  });

  it('passes a program that draws and animates', () => {
    const report = runHeadless(octo(MOVING));
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.framesRun).toBe(300);
  });

  it('passes a program that only changes after a keypress', () => {
    const src = `
: main
  i := dot
  v1 := 5
  sprite v0 v0 1
  loop
    v2 := 1
    if v2 key then sprite v0 v1 1
    v2 := 2
    if v2 key then sprite v0 v1 1
    v2 := 3
    if v2 key then sprite v0 v1 1
  again
: dot 0x80
`;
    const report = runHeadless(octo(src));
    expect(report.passed).toBe(true);
    expect(report.changedAfterKeypress).toBe(true);
  });

  it('is deterministic', () => {
    const bytes = octo(MOVING);
    expect(runHeadless(bytes)).toEqual(runHeadless(bytes));
  });

  it('fails a program that crashes (unknown opcode)', () => {
    const report = runHeadless(rom(0x00e0, 0xffff));
    expect(report.passed).toBe(false);
    expect(report.crashed).toBe(true);
    expect(report.crashReason).toContain('unknown opcode');
    expect(report.failures[0]).toContain('crashed');
  });

  it('fails a program that draws then clears (blank display after frame 5)', () => {
    // Draw the glyph for 0, keep it for 3 frames (delay timer), clear, then spin forever.
    const report = runHeadless(
      rom(0xa050, 0xd015, 0x6003, 0xf015, 0xf107, 0x3100, 0x1208, 0x00e0, 0x1210),
    );
    expect(report.passed).toBe(false);
    expect(report.crashed).toBe(false);
    expect(report.nonBlankAfterFrame5).toBe(false);
    expect(report.hungWithoutDrawing).toBe(false);
  });

  it('fails a program whose display never changes (static)', () => {
    // Draw once at the start, then spin on a jump to self.
    const report = runHeadless(rom(0xa050, 0xd015, 0x1204));
    expect(report.passed).toBe(false);
    expect(report.nonBlankAfterFrame5).toBe(true);
    expect(report.displayChanged).toBe(false);
  });

  it('fails a program that never draws (hang)', () => {
    const report = runHeadless(rom(0x1200));
    expect(report.passed).toBe(false);
    expect(report.hungWithoutDrawing).toBe(true);
    expect(report.displayChanged).toBe(false);
    expect(report.failures.join(' ')).toContain('never drew');
  });

  it('fails a program that waits for a key without drawing', () => {
    const report = runHeadless(rom(0xf00a, 0x1200));
    // The scripted keys release, so FX0A completes, but nothing is ever drawn.
    expect(report.passed).toBe(false);
    expect(report.hungWithoutDrawing).toBe(true);
  });
});
