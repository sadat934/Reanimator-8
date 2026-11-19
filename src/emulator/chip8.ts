/*
 * CHIP-8 core, written from scratch for this project. No DOM or Node imports.
 *
 * QUIRKS (defaults live in DEFAULT_QUIRKS in types.ts and can be overridden per machine)
 * ------------------------------------------------------------------------------------
 * RECONCILE WITH OCTO IN SPEC 2: ROMs are compiled by Octo, so every default below must
 * be checked against the vendored Octo version and changed if it differs.
 *
 * Shift (8XY6, 8XYE): shiftUsesVy = true.
 *   VX = VY shifted by one, VF = the bit shifted out. Original CHIP-8 semantics and the
 *   Octo default, so Octo programs expect it.
 * Load/store (FX55, FX65): loadStoreIncrementsI = true.
 *   I += X + 1 afterwards. Original semantics and Octo default.
 * Jump (BNNN): jumpUsesVx = false.
 *   PC = NNN + V0. Original semantics and Octo default.
 * VF reset (8XY1, 8XY2, 8XY3): logicResetsVf = false.
 *   VF is left alone. Octo default. The original COSMAC VIP resets VF, so this differs
 *   from the VIP. Octo output does not depend on the reset.
 * Sprite clipping/wrapping (DXYN): spriteWrap = true.
 *   The start coordinate always wraps (VX % 64, VY % 32). Pixels that run past an edge
 *   wrap to the other side. Octo default, and LLM-written games often draw near edges.
 *   The VIP clips instead.
 * Key wait (FX0A): waitKeyOnRelease = true.
 *   The instruction completes when a key that was seen pressed during the wait is
 *   released, and stores that key in VX. Original VIP behaviour.
 * Flag ordering (8XY4..8XY7, 8XYE): flagWrittenLast = true.
 *   The result is computed first, then VX is written, then VF. When X = 0xF the flag wins.
 *
 * Fixed behaviour (not configurable): 7XNN and FX1E set no flag. DXYN with N = 0 draws
 * nothing and clears VF (no SUPER-CHIP 16x16 sprites). 0NNN (SYS) is an unknown opcode.
 * Subtract flag is "not borrow" (VF = 1 when the minuend >= the subtrahend).
 *
 * CRASHES: the core never throws on a bad program. It records a CrashReason, leaves PC
 * at the faulting instruction, and turns step() and runFrame() into no-ops.
 * Every check happens before any write, so a crashing instruction has no partial effect.
 *
 * DETERMINISM: no clock and no Math.random. CXNN uses a seeded PRNG that is reseeded on
 * loadRom/reset.
 */

import { FONT } from './font';
import { Rng } from './rng';
import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  FONT_START,
  MAX_ROM_SIZE,
  MEMORY_SIZE,
  PROGRAM_START,
  STACK_DEPTH,
  resolveConfig,
} from './types';
import type { Chip8Config, Chip8Status, CrashReason, ResolvedConfig } from './types';

export class Chip8 {
  private readonly config: ResolvedConfig;
  private readonly rng: Rng;
  private readonly mem = new Uint8Array(MEMORY_SIZE);
  private readonly v = new Uint8Array(16);
  private readonly stack = new Uint16Array(STACK_DEPTH);
  private readonly keys = new Uint8Array(16);
  private readonly display = new Uint8Array(DISPLAY_WIDTH * DISPLAY_HEIGHT);
  private i = 0;
  private pc = PROGRAM_START;
  private sp = 0;
  private delay = 0;
  private sound = 0;
  private cycles = 0;
  private frames = 0;
  private crash: CrashReason | null = null;
  private waiting = false;
  private latchedKey = -1;
  private opPc = PROGRAM_START;
  private rom: Uint8Array | null = null;

  constructor(config: Partial<Chip8Config> = {}) {
    this.config = resolveConfig(config);
    this.rng = new Rng(this.config.seed);
    this.resetState();
  }

  // ---- public API ----

  /** Validates the ROM, resets all state, installs the font, copies the ROM to 0x200. */
  loadRom(bytes: Uint8Array): void {
    if (!(bytes instanceof Uint8Array)) throw new TypeError('ROM must be a Uint8Array');
    if (bytes.length === 0) throw new RangeError('ROM is empty');
    if (bytes.length > MAX_ROM_SIZE) {
      throw new RangeError(`ROM is ${bytes.length} bytes, the limit is ${MAX_ROM_SIZE}`);
    }
    this.rom = Uint8Array.from(bytes);
    this.resetState();
  }

  /** Reloads the current ROM (or clears the machine if none was loaded). Keeps config. */
  reset(): void {
    this.resetState();
  }

  /** Executes one instruction. Does not tick timers. */
  step(): void {
    if (this.crash) return;
    const pc = this.pc;
    if (pc > MEMORY_SIZE - 2) {
      this.fail({ kind: 'out-of-bounds-memory', pc, address: pc, opcode: 0 });
      return;
    }
    const op = (this.byte(pc) << 8) | this.byte(pc + 1);
    this.opPc = pc;
    this.pc = pc + 2;
    this.cycles++;
    this.execute(op);
    if (this.crash) this.pc = pc;
  }

  /** Runs cyclesPerFrame instructions, then ticks both timers once. */
  runFrame(): void {
    if (this.crash) return;
    for (let c = 0; c < this.config.cyclesPerFrame; c++) {
      this.step();
      if (this.crash) return;
    }
    if (this.delay > 0) this.delay--;
    if (this.sound > 0) this.sound--;
    this.frames++;
  }

  pressKey(k: number): void {
    this.checkKey(k);
    this.keys[k] = 1;
  }

  releaseKey(k: number): void {
    this.checkKey(k);
    this.keys[k] = 0;
  }

  /** Returns a copy: 2048 entries (0 or 1), row-major, 64 per row. */
  getDisplay(): Uint8Array {
    return this.display.slice();
  }

  getStatus(): Chip8Status {
    return {
      crashed: this.crash !== null,
      reason: this.crash ? { ...this.crash } : null,
      pc: this.pc,
      cycles: this.cycles,
      frames: this.frames,
      delayTimer: this.delay,
      soundTimer: this.sound,
      waitingForKey: this.waiting,
    };
  }

  /** Read-only copies of internal state, for tests and debugging tools. */
  inspect(): { v: Uint8Array; i: number; sp: number; stack: number[]; memory: Uint8Array } {
    return {
      v: this.v.slice(),
      i: this.i,
      sp: this.sp,
      stack: Array.from(this.stack.subarray(0, this.sp)),
      memory: this.mem.slice(),
    };
  }

  // ---- internals ----

  private checkKey(k: number): void {
    if (!Number.isInteger(k) || k < 0 || k > 15) {
      throw new RangeError('key must be an integer from 0 to 15');
    }
  }

  private byte(addr: number): number {
    return this.mem[addr] as number;
  }

  private reg(n: number): number {
    return this.v[n] as number;
  }

  private resetState(): void {
    this.mem.fill(0);
    this.mem.set(FONT, FONT_START);
    if (this.rom) this.mem.set(this.rom, PROGRAM_START);
    this.v.fill(0);
    this.stack.fill(0);
    this.keys.fill(0);
    this.display.fill(0);
    this.i = 0;
    this.pc = PROGRAM_START;
    this.sp = 0;
    this.delay = 0;
    this.sound = 0;
    this.cycles = 0;
    this.frames = 0;
    this.crash = null;
    this.waiting = false;
    this.latchedKey = -1;
    this.rng.seed(this.config.seed);
  }

  private fail(reason: CrashReason): void {
    this.crash = reason;
    this.waiting = false;
  }

  private unknown(op: number): void {
    this.fail({ kind: 'unknown-opcode', opcode: op, pc: this.opPc });
  }

  private outOfBounds(op: number, address: number): void {
    this.fail({ kind: 'out-of-bounds-memory', pc: this.opPc, address, opcode: op });
  }

  /** Writes VX then VF (or VF then VX) depending on the flag-ordering quirk. */
  private setWithFlag(x: number, result: number, flag: number): void {
    if (this.config.quirks.flagWrittenLast) {
      this.v[x] = result;
      this.v[0xf] = flag;
    } else {
      this.v[0xf] = flag;
      this.v[x] = result;
    }
  }

  private execute(op: number): void {
    const x = (op >> 8) & 0xf;
    const y = (op >> 4) & 0xf;
    const n = op & 0xf;
    const nn = op & 0xff;
    const nnn = op & 0xfff;

    switch (op >> 12) {
      case 0x0:
        if (op === 0x00e0) {
          this.display.fill(0);
        } else if (op === 0x00ee) {
          if (this.sp === 0) {
            this.fail({ kind: 'stack-underflow', pc: this.opPc });
          } else {
            this.sp--;
            this.pc = this.stack[this.sp] as number;
          }
        } else {
          this.unknown(op);
        }
        return;
      case 0x1:
        this.pc = nnn;
        return;
      case 0x2:
        if (this.sp >= STACK_DEPTH) {
          this.fail({ kind: 'stack-overflow', pc: this.opPc });
        } else {
          this.stack[this.sp] = this.pc;
          this.sp++;
          this.pc = nnn;
        }
        return;
      case 0x3:
        if (this.reg(x) === nn) this.pc += 2;
        return;
      case 0x4:
        if (this.reg(x) !== nn) this.pc += 2;
        return;
      case 0x5:
        if (n !== 0) this.unknown(op);
        else if (this.reg(x) === this.reg(y)) this.pc += 2;
        return;
      case 0x6:
        this.v[x] = nn;
        return;
      case 0x7:
        this.v[x] = this.reg(x) + nn; // Uint8Array wraps at 8 bits, no flag
        return;
      case 0x8:
        this.executeAlu(op, x, y, n);
        return;
      case 0x9:
        if (n !== 0) this.unknown(op);
        else if (this.reg(x) !== this.reg(y)) this.pc += 2;
        return;
      case 0xa:
        this.i = nnn;
        return;
      case 0xb:
        this.pc = nnn + (this.config.quirks.jumpUsesVx ? this.reg(x) : this.reg(0));
        return;
      case 0xc:
        this.v[x] = this.rng.nextByte() & nn;
        return;
      case 0xd:
        this.drawSprite(op, this.reg(x), this.reg(y), n);
        return;
      case 0xe:
        if (nn === 0x9e) {
          if (this.keys[this.reg(x) & 0xf]) this.pc += 2;
        } else if (nn === 0xa1) {
          if (!this.keys[this.reg(x) & 0xf]) this.pc += 2;
        } else {
          this.unknown(op);
        }
        return;
      default:
        this.executeF(op, x, nn);
    }
  }

  private executeAlu(op: number, x: number, y: number, n: number): void {
    const vx = this.reg(x);
    const vy = this.reg(y);
    const q = this.config.quirks;
    switch (n) {
      case 0x0:
        this.v[x] = vy;
        return;
      case 0x1:
        this.v[x] = vx | vy;
        if (q.logicResetsVf) this.v[0xf] = 0;
        return;
      case 0x2:
        this.v[x] = vx & vy;
        if (q.logicResetsVf) this.v[0xf] = 0;
        return;
      case 0x3:
        this.v[x] = vx ^ vy;
        if (q.logicResetsVf) this.v[0xf] = 0;
        return;
      case 0x4: {
        const sum = vx + vy;
        this.setWithFlag(x, sum & 0xff, sum > 0xff ? 1 : 0);
        return;
      }
      case 0x5:
        this.setWithFlag(x, (vx - vy) & 0xff, vx >= vy ? 1 : 0);
        return;
      case 0x6: {
        const src = q.shiftUsesVy ? vy : vx;
        this.setWithFlag(x, src >> 1, src & 1);
        return;
      }
      case 0x7:
        this.setWithFlag(x, (vy - vx) & 0xff, vy >= vx ? 1 : 0);
        return;
      case 0xe: {
        const src = q.shiftUsesVy ? vy : vx;
        this.setWithFlag(x, (src << 1) & 0xff, (src >> 7) & 1);
        return;
      }
      default:
        this.unknown(op);
    }
  }

  private drawSprite(op: number, vx: number, vy: number, n: number): void {
    if (n > 0 && this.i + n > MEMORY_SIZE) {
      this.outOfBounds(op, this.i + n - 1);
      return;
    }
    const x0 = vx % DISPLAY_WIDTH;
    const y0 = vy % DISPLAY_HEIGHT;
    const wrap = this.config.quirks.spriteWrap;
    let collision = 0;
    for (let row = 0; row < n; row++) {
      let py = y0 + row;
      if (py >= DISPLAY_HEIGHT) {
        if (!wrap) break;
        py -= DISPLAY_HEIGHT;
      }
      const bits = this.byte(this.i + row);
      for (let col = 0; col < 8; col++) {
        if ((bits & (0x80 >> col)) === 0) continue;
        let px = x0 + col;
        if (px >= DISPLAY_WIDTH) {
          if (!wrap) continue;
          px -= DISPLAY_WIDTH;
        }
        const idx = py * DISPLAY_WIDTH + px;
        if (this.display[idx]) collision = 1;
        this.display[idx] = (this.display[idx] as number) ^ 1;
      }
    }
    this.v[0xf] = collision;
  }

  private executeF(op: number, x: number, nn: number): void {
    const vx = this.reg(x);
    switch (nn) {
      case 0x07:
        this.v[x] = this.delay;
        return;
      case 0x0a:
        this.waitForKey(x);
        return;
      case 0x15:
        this.delay = vx;
        return;
      case 0x18:
        this.sound = vx;
        return;
      case 0x1e:
        this.i = (this.i + vx) & 0xffff;
        return;
      case 0x29:
        this.i = FONT_START + (vx & 0xf) * 5;
        return;
      case 0x33:
        if (this.i + 2 >= MEMORY_SIZE) {
          this.outOfBounds(op, this.i + 2);
          return;
        }
        this.mem[this.i] = Math.floor(vx / 100);
        this.mem[this.i + 1] = Math.floor(vx / 10) % 10;
        this.mem[this.i + 2] = vx % 10;
        return;
      case 0x55:
        if (this.i + x >= MEMORY_SIZE) {
          this.outOfBounds(op, this.i + x);
          return;
        }
        for (let r = 0; r <= x; r++) this.mem[this.i + r] = this.reg(r);
        if (this.config.quirks.loadStoreIncrementsI) this.i = (this.i + x + 1) & 0xffff;
        return;
      case 0x65:
        if (this.i + x >= MEMORY_SIZE) {
          this.outOfBounds(op, this.i + x);
          return;
        }
        for (let r = 0; r <= x; r++) this.v[r] = this.byte(this.i + r);
        if (this.config.quirks.loadStoreIncrementsI) this.i = (this.i + x + 1) & 0xffff;
        return;
      default:
        this.unknown(op);
    }
  }

  /**
   * FX0A is a stall: while the wait is unfinished PC is moved back so the same
   * instruction runs again on the next step (and counts as a cycle).
   */
  private waitForKey(x: number): void {
    let done = -1;
    if (this.config.quirks.waitKeyOnRelease) {
      if (this.latchedKey === -1) this.latchedKey = this.firstPressedKey();
      if (this.latchedKey !== -1 && !this.keys[this.latchedKey]) done = this.latchedKey;
    } else {
      done = this.firstPressedKey();
    }
    if (done === -1) {
      this.pc = this.opPc;
      this.waiting = true;
      return;
    }
    this.v[x] = done;
    this.latchedKey = -1;
    this.waiting = false;
  }

  private firstPressedKey(): number {
    for (let k = 0; k < 16; k++) if (this.keys[k]) return k;
    return -1;
  }
}
