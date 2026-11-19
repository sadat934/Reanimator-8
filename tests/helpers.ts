import { Chip8 } from '../src/emulator';
import type { Chip8Config } from '../src/emulator';

/** Builds ROM bytes from 16-bit opcodes. */
export function rom(...ops: number[]): Uint8Array {
  return Uint8Array.from(ops.flatMap((op) => [(op >> 8) & 0xff, op & 0xff]));
}

/** Loads the opcodes into a fresh machine without running them. */
export function machine(ops: number[], config: Partial<Chip8Config> = {}): Chip8 {
  const m = new Chip8(config);
  m.loadRom(rom(...ops));
  return m;
}

/** Loads the opcodes and executes exactly `steps` instructions (default: one per opcode). */
export function run(ops: number[], config: Partial<Chip8Config> = {}, steps = ops.length): Chip8 {
  const m = machine(ops, config);
  for (let s = 0; s < steps; s++) m.step();
  return m;
}

/** Register values V0..VF after running the opcodes. */
export function regs(m: Chip8): number[] {
  return Array.from(m.inspect().v);
}

/** Lit pixel coordinates as "x,y" strings, sorted by row then column. */
export function litPixels(m: Chip8): string[] {
  const d = m.getDisplay();
  const out: string[] = [];
  for (let i = 0; i < d.length; i++) if (d[i]) out.push(`${i % 64},${Math.floor(i / 64)}`);
  return out;
}
