// Public types, constants, config validation, and crash text for the CHIP-8 core.
// No DOM or Node imports: the core is reused by the headless harness later.

export const MEMORY_SIZE = 4096;
export const PROGRAM_START = 0x200;
export const FONT_START = 0x050;
export const MAX_ROM_SIZE = MEMORY_SIZE - PROGRAM_START; // 3584
export const DISPLAY_WIDTH = 64;
export const DISPLAY_HEIGHT = 32;
export const STACK_DEPTH = 16;

export type Quirks = {
  /** 8XY6/8XYE: true => VX = VY shifted; false => VX shifted in place. */
  shiftUsesVy: boolean;
  /** FX55/FX65: true => I += X + 1 afterwards. */
  loadStoreIncrementsI: boolean;
  /** BNNN: false => PC = NNN + V0; true => BXNN uses VX. */
  jumpUsesVx: boolean;
  /** 8XY1/8XY2/8XY3: true => VF = 0 afterwards. */
  logicResetsVf: boolean;
  /** DXYN: true => pixels wrap at the edges; false => clipped. */
  spriteWrap: boolean;
  /** FX0A: true => completes when the key is released; false => on press. */
  waitKeyOnRelease: boolean;
  /** Flag-writing ALU ops: true => VF is written after VX, so VF wins when X = 0xF. */
  flagWrittenLast: boolean;
};

/**
 * Reconciled with the vendored Octo in spec 2 (compiler-and-harness): all seven values equal
 * what Octo's own emulator does with every quirk option off. Pinned by
 * tests/compiler/octo-quirks.test.ts.
 */
export const DEFAULT_QUIRKS: Readonly<Quirks> = {
  shiftUsesVy: true,
  loadStoreIncrementsI: true,
  jumpUsesVx: false,
  logicResetsVf: false,
  spriteWrap: true,
  waitKeyOnRelease: true,
  flagWrittenLast: true,
};

export type Chip8Config = {
  /** Integer 1..1000. Default 12. */
  cyclesPerFrame: number;
  /** Merged over DEFAULT_QUIRKS. */
  quirks: Partial<Quirks>;
  /** uint32 seed for CXNN. Default 1. */
  seed: number;
};

export type ResolvedConfig = {
  cyclesPerFrame: number;
  quirks: Quirks;
  seed: number;
};

export type CrashReason =
  | { kind: 'unknown-opcode'; opcode: number; pc: number }
  | { kind: 'stack-overflow'; pc: number }
  | { kind: 'stack-underflow'; pc: number }
  | { kind: 'out-of-bounds-memory'; pc: number; address: number; opcode: number };

export type Chip8Status = {
  crashed: boolean;
  reason: CrashReason | null;
  pc: number;
  cycles: number;
  frames: number;
  delayTimer: number;
  soundTimer: number;
  waitingForKey: boolean;
};

const hex = (n: number, width: number): string =>
  '0x' + n.toString(16).toUpperCase().padStart(width, '0');

/** Human-readable crash text for the UI and for later repair reports. */
export function describeCrash(reason: CrashReason): string {
  switch (reason.kind) {
    case 'unknown-opcode':
      return `unknown opcode ${hex(reason.opcode, 4)} at ${hex(reason.pc, 3)}`;
    case 'stack-overflow':
      return `stack overflow at ${hex(reason.pc, 3)} (more than ${STACK_DEPTH} nested calls)`;
    case 'stack-underflow':
      return `stack underflow at ${hex(reason.pc, 3)} (return with no call)`;
    case 'out-of-bounds-memory':
      return `out-of-bounds memory access at ${hex(reason.address, 4)} by opcode ${hex(reason.opcode, 4)} at ${hex(reason.pc, 3)}`;
  }
}

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** Validates a partial config and fills in defaults. Throws on caller bugs. */
export function resolveConfig(input: Partial<Chip8Config> = {}): ResolvedConfig {
  const cyclesPerFrame = input.cyclesPerFrame ?? 12;
  if (!isInt(cyclesPerFrame, 1, 1000)) {
    throw new RangeError('cyclesPerFrame must be an integer from 1 to 1000');
  }
  const seed = input.seed ?? 1;
  if (!isInt(seed, 0, 0xffffffff)) {
    throw new RangeError('seed must be an integer from 0 to 4294967295');
  }
  const quirks: Quirks = { ...DEFAULT_QUIRKS };
  for (const [key, value] of Object.entries(input.quirks ?? {})) {
    if (!(key in DEFAULT_QUIRKS)) throw new TypeError(`unknown quirk "${key}"`);
    if (typeof value !== 'boolean') throw new TypeError(`quirk "${key}" must be a boolean`);
    quirks[key as keyof Quirks] = value;
  }
  return { cyclesPerFrame, quirks, seed };
}
