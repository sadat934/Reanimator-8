import { describe, expect, it } from 'vitest';
import { litPixels, machine, regs, run } from '../helpers';

describe('flow opcodes', () => {
  it('00E0 clears the display', () => {
    const m = machine([0xa050, 0xd005, 0x00e0]);
    m.step();
    m.step();
    expect(litPixels(m).length).toBeGreaterThan(0);
    m.step();
    expect(litPixels(m)).toEqual([]);
  });

  it('1NNN jumps', () => {
    const m = run([0x1208], {}, 1);
    expect(m.getStatus().pc).toBe(0x208);
  });

  it('2NNN calls and 00EE returns', () => {
    const m = machine([0x2206, 0x6101, 0x1204, 0x6202, 0x00ee]);
    m.step(); // call 206
    expect(m.getStatus().pc).toBe(0x206);
    expect(m.inspect().stack).toEqual([0x202]);
    m.step(); // V2 = 2
    m.step(); // return
    expect(m.getStatus().pc).toBe(0x202);
    expect(m.inspect().sp).toBe(0);
    m.step(); // V1 = 1
    expect(regs(m).slice(1, 3)).toEqual([1, 2]);
  });

  it('BNNN jumps to NNN + V0 by default', () => {
    const m = run([0x6005, 0xb300]);
    expect(m.getStatus().pc).toBe(0x305);
  });

  it('BXNN uses VX when jumpUsesVx is on', () => {
    const m = run([0x6005, 0x6107, 0xb100], { quirks: { jumpUsesVx: true } });
    expect(m.getStatus().pc).toBe(0x107);
  });

  it('0NNN (SYS) is an unknown opcode', () => {
    const m = run([0x0123]);
    expect(m.getStatus().reason).toMatchObject({ kind: 'unknown-opcode', opcode: 0x0123 });
  });
});
