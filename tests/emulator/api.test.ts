import { describe, expect, it } from 'vitest';
import { Chip8, MAX_ROM_SIZE, PROGRAM_START } from '../../src/emulator';
import { machine, rom } from '../helpers';

describe('loadRom validation', () => {
  it('rejects a non-Uint8Array with TypeError', () => {
    const m = new Chip8();
    expect(() => m.loadRom([1, 2] as unknown as Uint8Array)).toThrow(TypeError);
  });

  it('rejects empty and oversize ROMs with RangeError and leaves the machine unchanged', () => {
    const m = machine([0x6007, 0x1200]);
    m.step();
    expect(() => m.loadRom(new Uint8Array(0))).toThrow(RangeError);
    expect(() => m.loadRom(new Uint8Array(MAX_ROM_SIZE + 1))).toThrow(RangeError);
    expect(m.getStatus().cycles).toBe(1);
    expect(m.inspect().v[0]).toBe(7);
  });

  it('accepts a ROM of exactly 3584 bytes', () => {
    const m = new Chip8();
    m.loadRom(new Uint8Array(MAX_ROM_SIZE));
    expect(m.inspect().memory.length).toBe(4096);
  });

  it('copies the ROM to 0x200 and later edits of the input do not leak in', () => {
    const bytes = rom(0x6042);
    const m = new Chip8();
    m.loadRom(bytes);
    bytes[1] = 0;
    expect(m.inspect().memory[PROGRAM_START + 1]).toBe(0x42);
  });

  it('loadRom resets everything, including keys and crash state', () => {
    const m = machine([0xf0ff]);
    m.pressKey(3);
    m.step();
    expect(m.getStatus().crashed).toBe(true);
    m.loadRom(rom(0xf30a));
    expect(m.getStatus()).toMatchObject({ crashed: false, reason: null, pc: 0x200, cycles: 0 });
    m.step();
    m.releaseKey(3);
    m.step();
    expect(m.getStatus().waitingForKey).toBe(true); // key 3 was cleared by the load
  });

  it('reset reloads the current ROM', () => {
    const m = machine([0x6009]);
    m.step();
    m.reset();
    expect(m.inspect().v[0]).toBe(0);
    m.step();
    expect(m.inspect().v[0]).toBe(9);
  });
});

describe('key validation', () => {
  it.each([-1, 16, 1.5, NaN, Infinity])('rejects %s', (k) => {
    const m = new Chip8();
    expect(() => m.pressKey(k)).toThrow(RangeError);
    expect(() => m.releaseKey(k)).toThrow(RangeError);
  });

  it('rejects non-numbers', () => {
    const m = new Chip8();
    expect(() => m.pressKey('1' as unknown as number)).toThrow(RangeError);
  });

  it('accepts 0 and 15', () => {
    const m = new Chip8();
    m.pressKey(0);
    m.releaseKey(15);
  });
});

describe('config validation', () => {
  it('rejects bad cyclesPerFrame', () => {
    for (const c of [0, 1001, 2.5]) expect(() => new Chip8({ cyclesPerFrame: c })).toThrow(RangeError);
  });

  it('rejects bad seeds', () => {
    for (const s of [-1, 2 ** 32, 1.5]) expect(() => new Chip8({ seed: s })).toThrow(RangeError);
  });

  it('rejects unknown quirks and non-boolean values with TypeError', () => {
    expect(() => new Chip8({ quirks: { nope: true } as never })).toThrow(TypeError);
    expect(() => new Chip8({ quirks: { spriteWrap: 1 } as never })).toThrow(TypeError);
  });

  it('runFrame runs cyclesPerFrame instructions', () => {
    const m = machine([0x1200], { cyclesPerFrame: 7 });
    m.runFrame();
    expect(m.getStatus()).toMatchObject({ cycles: 7, frames: 1 });
  });
});

describe('getDisplay and getStatus return copies', () => {
  it('mutating getDisplay output does not change the machine', () => {
    const m = machine([0xa050, 0xd015, 0x1204]);
    m.step();
    m.step();
    const a = m.getDisplay();
    const snapshot = a.slice();
    a.fill(1);
    expect(m.getDisplay()).toEqual(snapshot);
    expect(m.getDisplay()).not.toBe(m.getDisplay());
  });

  it('getStatus returns a fresh object each call', () => {
    const m = machine([0xf0ff]);
    m.step();
    const s = m.getStatus();
    expect(m.getStatus()).not.toBe(s);
    expect(m.getStatus().reason).not.toBe(s.reason);
  });
});
