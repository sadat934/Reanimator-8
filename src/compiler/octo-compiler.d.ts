/** Type declarations for the vendored Octo compiler (octo-compiler.js). Written for this project. */

/** A token position: [token, startOffset, endOffset], offsets are 1-based character positions in the source. */
export type OctoPos = [token: unknown, start: number, end: number];

export class Compiler {
  constructor(source: string);
  /** Output bytes, index 0 is address 0x200. Complete after go() returns without throwing. */
  rom: number[];
  /** Set when SUPER-CHIP instructions were used. */
  schip: boolean;
  /** Set when XO-CHIP instructions were used. */
  xo: boolean;
  /** Position of the token being processed when go() threw, or null. */
  pos: OctoPos | null;
  /** Compiles the source. Throws a string describing the first error. */
  go(): void;
}
