/**
 * Typed wrapper around the vendored Octo compiler (octo-compiler.js, MIT, see LICENSE).
 * Written for this project. The wrapper never throws: every failure is returned as data.
 */

import { MAX_ROM_SIZE } from '../emulator/types';
import { Compiler } from './octo-compiler.js';

export type CompileError = {
  message: string;
  /** 1-based source line, or null when the error has no source position (for example ROM too large). */
  line: number | null;
};

export type CompileResult =
  | { ok: true; rom: Uint8Array }
  | { ok: false; errors: CompileError[] };

/** 1-based line of a 1-based character offset, computed the same way Octo's own editor does. */
function lineOfOffset(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset - 1 && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function fail(message: string, line: number | null = null): CompileResult {
  return { ok: false, errors: [{ message, line }] };
}

/**
 * Compiles Octo source to CHIP-8 ROM bytes (to be loaded at 0x200).
 * Octo stops at its first error, so a failed result holds exactly one error.
 *
 * SUPER-CHIP and XO-CHIP instructions are rejected because our emulator is plain CHIP-8
 * (see the quirk notes in src/emulator/chip8.ts).
 */
export function compile(source: string): CompileResult {
  const compiler = new Compiler(source);
  try {
    compiler.go();
  } catch (e) {
    const message = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
    const line = compiler.pos ? lineOfOffset(source, compiler.pos[1]) : null;
    return fail(message, line);
  }
  if (compiler.schip || compiler.xo) {
    return fail('This program uses SUPER-CHIP or XO-CHIP instructions, which are not supported. Use plain CHIP-8 only.');
  }
  if (compiler.rom.length > MAX_ROM_SIZE) {
    return fail(`ROM is too large: ${compiler.rom.length} bytes, the limit is ${MAX_ROM_SIZE}.`);
  }
  return { ok: true, rom: Uint8Array.from(compiler.rom) };
}
