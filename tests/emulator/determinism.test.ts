import { describe, expect, it } from 'vitest';
import { Chip8, TEST_ROM } from '../../src/emulator';
import { rom } from '../helpers';

function play(machine: Chip8): void {
  machine.loadRom(
    rom(0xc0ff, 0xc1ff, 0xa050, 0xd015, 0x7001, 0x7101, 0xf00a, 0xc2ff, 0x1206),
  );
  for (let f = 0; f < 120; f++) {
    if (f % 10 === 3) machine.pressKey(f % 16);
    if (f % 10 === 7) machine.releaseKey((f - 4) % 16);
    machine.runFrame();
  }
}

describe('determinism', () => {
  it('two machines with the same ROM, config, and calls end byte-identical', () => {
    const a = new Chip8({ seed: 99 });
    const b = new Chip8({ seed: 99 });
    play(a);
    play(b);
    expect(a.getDisplay()).toEqual(b.getDisplay());
    expect(a.getStatus()).toEqual(b.getStatus());
    expect(a.inspect()).toEqual(b.inspect());
  });

  it('reloading the same ROM on one machine replays the same run', () => {
    const m = new Chip8({ seed: 5 });
    play(m);
    const first = { d: m.getDisplay(), s: m.getStatus() };
    play(m);
    expect(m.getDisplay()).toEqual(first.d);
    expect(m.getStatus()).toEqual(first.s);
  });

  it('the test ROM runs identically twice', () => {
    const run = () => {
      const m = new Chip8();
      m.loadRom(TEST_ROM);
      for (let f = 0; f < 30; f++) m.runFrame();
      return m.getDisplay();
    };
    expect(run()).toEqual(run());
  });
});
