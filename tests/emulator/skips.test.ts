import { describe, expect, it } from 'vitest';
import { machine, run } from '../helpers';

const pcAfter = (ops: number[]) => run(ops).getStatus().pc;

describe('conditional skips', () => {
  it('3XNN skips when equal', () => {
    expect(pcAfter([0x6105, 0x3105])).toBe(0x206);
    expect(pcAfter([0x6105, 0x3106])).toBe(0x204);
  });

  it('4XNN skips when not equal', () => {
    expect(pcAfter([0x6105, 0x4106])).toBe(0x206);
    expect(pcAfter([0x6105, 0x4105])).toBe(0x204);
  });

  it('5XY0 skips when registers are equal', () => {
    expect(pcAfter([0x6105, 0x6205, 0x5120])).toBe(0x208);
    expect(pcAfter([0x6105, 0x6206, 0x5120])).toBe(0x206);
  });

  it('9XY0 skips when registers differ', () => {
    expect(pcAfter([0x6105, 0x6206, 0x9120])).toBe(0x208);
    expect(pcAfter([0x6105, 0x6205, 0x9120])).toBe(0x206);
  });

  it('5XY1 and 9XY1 are unknown opcodes', () => {
    expect(run([0x5121]).getStatus().reason?.kind).toBe('unknown-opcode');
    expect(run([0x9121]).getStatus().reason?.kind).toBe('unknown-opcode');
  });

  it('EX9E skips when the key is down', () => {
    const m = machine([0x610a, 0xe19e]);
    m.pressKey(0xa);
    m.step();
    m.step();
    expect(m.getStatus().pc).toBe(0x206);
  });

  it('EX9E does not skip when the key is up', () => {
    expect(pcAfter([0x610a, 0xe19e])).toBe(0x204);
  });

  it('EXA1 skips when the key is up, not when down', () => {
    expect(pcAfter([0x610a, 0xe1a1])).toBe(0x206);
    const m = machine([0x610a, 0xe1a1]);
    m.pressKey(0xa);
    m.step();
    m.step();
    expect(m.getStatus().pc).toBe(0x204);
  });

  it('EX with another low byte is an unknown opcode', () => {
    expect(run([0xe1ff]).getStatus().reason?.kind).toBe('unknown-opcode');
  });
});
