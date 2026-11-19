import { describe, expect, it } from 'vitest';
import { regs, run } from '../helpers';

const alu = (x: number, y: number, op: number, config = {}) =>
  regs(run([0x6100 | x, 0x6200 | y, 0x8120 | op], config));

describe('8XY alu', () => {
  it('8XY1 OR, 8XY2 AND, 8XY3 XOR', () => {
    expect(alu(0b1100, 0b1010, 1)[1]).toBe(0b1110);
    expect(alu(0b1100, 0b1010, 2)[1]).toBe(0b1000);
    expect(alu(0b1100, 0b1010, 3)[1]).toBe(0b0110);
  });

  it('logic ops leave VF alone by default and clear it with logicResetsVf', () => {
    const ops = [0x6f01, 0x6103, 0x6205, 0x8121];
    expect(regs(run(ops))[0xf]).toBe(1);
    expect(regs(run(ops, { quirks: { logicResetsVf: true } }))[0xf]).toBe(0);
  });

  it('8XY4 adds with carry', () => {
    let r = alu(0x10, 0x20, 4);
    expect([r[1], r[0xf]]).toEqual([0x30, 0]);
    r = alu(0xff, 0x02, 4);
    expect([r[1], r[0xf]]).toEqual([0x01, 1]);
  });

  it('8XY5 subtracts with not-borrow flag', () => {
    let r = alu(0x30, 0x10, 5);
    expect([r[1], r[0xf]]).toEqual([0x20, 1]);
    r = alu(0x10, 0x30, 5);
    expect([r[1], r[0xf]]).toEqual([0xe0, 0]);
    r = alu(0x10, 0x10, 5);
    expect([r[1], r[0xf]]).toEqual([0, 1]);
  });

  it('8XY7 reverse subtracts with not-borrow flag', () => {
    let r = alu(0x10, 0x30, 7);
    expect([r[1], r[0xf]]).toEqual([0x20, 1]);
    r = alu(0x30, 0x10, 7);
    expect([r[1], r[0xf]]).toEqual([0xe0, 0]);
  });

  it('8XY6 shifts VY by default (shiftUsesVy)', () => {
    const r = alu(0xff, 0x05, 6);
    expect([r[1], r[0xf]]).toEqual([0x02, 1]);
  });

  it('8XY6 shifts VX in place when shiftUsesVy is off', () => {
    const r = alu(0x06, 0x05, 6, { quirks: { shiftUsesVy: false } });
    expect([r[1], r[0xf]]).toEqual([0x03, 0]);
  });

  it('8XYE shifts left with the top bit in VF', () => {
    let r = alu(0, 0x81, 0xe);
    expect([r[1], r[0xf]]).toEqual([0x02, 1]);
    r = alu(0x41, 0x41, 0xe, { quirks: { shiftUsesVy: false } });
    expect([r[1], r[0xf]]).toEqual([0x82, 0]);
  });

  it('flag ordering: VF wins when X is 0xF (default), result wins when off', () => {
    const ops = [0x6fff, 0x6102, 0x8f14]; // VF = 0xFF + 2 => result 1, carry 1
    expect(regs(run(ops))[0xf]).toBe(1);
    const ops2 = [0x6f10, 0x6120, 0x8f14]; // result 0x30, carry 0
    expect(regs(run(ops2))[0xf]).toBe(0);
    expect(regs(run(ops2, { quirks: { flagWrittenLast: false } }))[0xf]).toBe(0x30);
  });

  it('8XY8 is an unknown opcode', () => {
    expect(run([0x8128]).getStatus().reason?.kind).toBe('unknown-opcode');
  });
});
