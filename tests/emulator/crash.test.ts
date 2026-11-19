import { describe, expect, it } from 'vitest';
import { describeCrash } from '../../src/emulator';
import { machine, run } from '../helpers';

describe('crash reasons', () => {
  it('unknown opcode 0xF0FF keeps pc at the faulting instruction', () => {
    const m = run([0x6001, 0xf0ff]);
    expect(m.getStatus()).toMatchObject({
      crashed: true,
      pc: 0x202,
      reason: { kind: 'unknown-opcode', opcode: 0xf0ff, pc: 0x202 },
    });
  });

  it('stack overflow on the 17th nested call', () => {
    const m = machine([0x2200]); // calls itself
    for (let s = 0; s < 16; s++) m.step();
    expect(m.getStatus().crashed).toBe(false);
    expect(m.inspect().sp).toBe(16);
    m.step();
    expect(m.getStatus()).toMatchObject({ crashed: true, pc: 0x200, reason: { kind: 'stack-overflow' } });
  });

  it('stack underflow on return with an empty stack', () => {
    const m = run([0x00ee]);
    expect(m.getStatus()).toMatchObject({ crashed: true, pc: 0x200, reason: { kind: 'stack-underflow', pc: 0x200 } });
  });

  it('out-of-bounds fetch', () => {
    const m = run([0x1ffe, 0x0000], {}, 1); // jump to 0xFFE: fetch ok (0x0000 not loaded => zeros)
    m.step(); // executes 0x0000 at 0xFFE => unknown opcode
    expect(m.getStatus().reason?.kind).toBe('unknown-opcode');
    const m2 = run([0x1fff]);
    m2.step();
    expect(m2.getStatus()).toMatchObject({ crashed: true, pc: 0xfff, reason: { kind: 'out-of-bounds-memory', address: 0xfff } });
  });

  it('out-of-bounds FX55/FX65/FX33/DXYN do not write or draw anything', () => {
    // FX55: I + X >= 4096
    let m = run([0xaff1, 0x6a77, 0xff55]);
    expect(m.getStatus().reason).toMatchObject({ kind: 'out-of-bounds-memory', address: 0xff1 + 15 });
    expect(m.inspect().memory[0xff1]).toBe(0);
    // FX55 at the last legal position works
    m = run([0xaff0, 0xff55]);
    expect(m.getStatus().crashed).toBe(false);
    // FX65
    m = run([0xaff1, 0xff65]);
    expect(m.getStatus().reason?.kind).toBe('out-of-bounds-memory');
    // FX33
    m = run([0xaffe, 0xf033]);
    expect(m.getStatus().reason).toMatchObject({ kind: 'out-of-bounds-memory', address: 0x1000 });
    // DXYN
    m = run([0xafff, 0xd002]);
    expect(m.getStatus().reason).toMatchObject({ kind: 'out-of-bounds-memory', pc: 0x202 });
    expect(m.getDisplay().every((p) => p === 0)).toBe(true);
  });

  it('a later access through a large I (FX1E) crashes', () => {
    const m = run([0xafff, 0x60ff, 0xf01e, 0xf033]);
    expect(m.getStatus().reason?.kind).toBe('out-of-bounds-memory');
  });

  it('a crashed machine ignores step and runFrame and does not throw', () => {
    const m = run([0xf0ff]);
    const before = m.getStatus();
    m.step();
    m.runFrame();
    expect(m.getStatus()).toEqual(before);
  });

  it('describeCrash gives readable text for every kind', () => {
    expect(describeCrash({ kind: 'unknown-opcode', opcode: 0xf0ff, pc: 0x200 })).toContain('0xF0FF');
    expect(describeCrash({ kind: 'stack-overflow', pc: 0x200 })).toContain('overflow');
    expect(describeCrash({ kind: 'stack-underflow', pc: 0x200 })).toContain('underflow');
    expect(describeCrash({ kind: 'out-of-bounds-memory', pc: 0x200, address: 0x1000, opcode: 0xf033 })).toContain('0x1000');
  });
});
