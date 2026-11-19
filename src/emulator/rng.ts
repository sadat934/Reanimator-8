// Small seeded PRNG (xorshift32) for CXNN. Deterministic: same seed, same sequence.

export class Rng {
  private state = 1;

  constructor(seed: number) {
    this.seed(seed);
  }

  /** Reseeds. Seed 0 is remapped because xorshift32 never leaves state 0. */
  seed(seed: number): void {
    this.state = ((seed >>> 0) ^ 0xa5a5a5a5) >>> 0 || 1;
  }

  nextByte(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return (x >>> 8) & 0xff;
  }
}
