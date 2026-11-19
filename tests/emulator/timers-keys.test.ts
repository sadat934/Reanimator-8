import { describe, expect, it } from 'vitest';
import { machine, regs, run } from '../helpers';

describe('timers', () => {
  it('FX15 sets and FX07 reads the delay timer', () => {
    const m = run([0x6009, 0xf015, 0xf107]);
    expect(m.getStatus().delayTimer).toBe(9);
    expect(regs(m)[1]).toBe(9);
  });

  it('FX18 sets the sound timer', () => {
    expect(run([0x6005, 0xf018]).getStatus().soundTimer).toBe(5);
  });

  it('timers tick once per frame, not per step', () => {
    const m = machine([0x6005, 0xf015, 0xf018, 0x1206], { cyclesPerFrame: 4 });
    m.runFrame(); // 3 setup steps + 1 jump, then tick
    expect(m.getStatus()).toMatchObject({ delayTimer: 4, soundTimer: 4, frames: 1 });
    m.runFrame();
    expect(m.getStatus()).toMatchObject({ delayTimer: 3, soundTimer: 3, frames: 2 });
  });

  it('timers stop at zero', () => {
    const m = machine([0x1200], { cyclesPerFrame: 1 });
    m.runFrame();
    expect(m.getStatus()).toMatchObject({ delayTimer: 0, soundTimer: 0 });
  });
});

describe('FX0A wait for key', () => {
  it('stalls with no key and reports waitingForKey', () => {
    const m = machine([0xf30a, 0x6101]);
    m.step();
    m.step();
    expect(m.getStatus()).toMatchObject({ pc: 0x200, waitingForKey: true });
  });

  it('completes on release by default and stores the key', () => {
    const m = machine([0xf30a]);
    m.step();
    m.pressKey(0xb);
    m.step();
    expect(m.getStatus().waitingForKey).toBe(true); // still held
    m.releaseKey(0xb);
    m.step();
    expect(m.getStatus()).toMatchObject({ pc: 0x202, waitingForKey: false });
    expect(regs(m)[3]).toBe(0xb);
  });

  it('a key already held when the wait begins completes after release', () => {
    const m = machine([0xf30a]);
    m.pressKey(4);
    m.step();
    m.releaseKey(4);
    m.step();
    expect(regs(m)[3]).toBe(4);
  });

  it('completes on press when waitKeyOnRelease is off', () => {
    const m = machine([0xf30a], { quirks: { waitKeyOnRelease: false } });
    m.step();
    m.pressKey(7);
    m.step();
    expect(m.getStatus()).toMatchObject({ pc: 0x202, waitingForKey: false });
    expect(regs(m)[3]).toBe(7);
  });

  it('timers still tick while waiting', () => {
    const m = machine([0x6003, 0xf015, 0xf10a], { cyclesPerFrame: 3 });
    m.runFrame();
    m.runFrame();
    expect(m.getStatus().delayTimer).toBe(1);
  });
});
