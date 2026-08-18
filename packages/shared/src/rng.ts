/**
 * PCG32 (O'Neill) — the one and only random source in the engine (ADR-002, ADR-005).
 *
 * 64-bit state is emulated with two uint32 halves using only `Math.imul`, integer
 * shifts and exact double arithmetic — no BigInt (slow) and nothing implementation-
 * defined. Output matches the reference C implementation bit for bit (see test).
 *
 * Injected, never global. Serialisable so a save can resume mid-match with the
 * identical stream. `fork()` derives an independent stream for a subsystem so
 * adding an RNG call in one place cannot perturb another.
 */
import { cos, log, TWO_PI } from './math/index.js';
import type { Scalar } from './scalar.js';

const MULT_HI = 0x5851f42d;
const MULT_LO = 0x4c957f2d;
const TWO32 = 4294967296;
const INV_TWO32 = 1 / TWO32;

/** (ah:al) * (bh:bl) mod 2^64 → [hi, lo] as uint32. */
function mul64(ah: number, al: number, bh: number, bl: number): [number, number] {
  const a0 = al & 0xffff, a1 = al >>> 16;
  const b0 = bl & 0xffff, b1 = bl >>> 16;
  const p00 = a0 * b0;
  const mid = a0 * b1 + a1 * b0; // < 2^33, exact in float64
  const midLo = mid % 65536;
  const midHi = (mid - midLo) / 65536;
  let lo = p00 + midLo * 65536; // < 2^33
  const carry = lo >= TWO32 ? 1 : 0;
  lo = lo - carry * TWO32;
  const hi = (a1 * b1 + midHi + carry + Math.imul(al, bh) + Math.imul(ah, bl)) >>> 0;
  return [hi, lo >>> 0];
}

/** (ah:al) + (bh:bl) mod 2^64 → [hi, lo]. */
function add64(ah: number, al: number, bh: number, bl: number): [number, number] {
  let lo = al + bl;
  const carry = lo >= TWO32 ? 1 : 0;
  lo = lo - carry * TWO32;
  return [(ah + bh + carry) >>> 0, lo >>> 0];
}

export interface RngState {
  readonly hi: number;
  readonly lo: number;
  readonly incHi: number;
  readonly incLo: number;
}

export class Rng {
  private hi = 0;
  private lo = 0;
  private incHi = 0;
  private incLo = 1;

  /**
   * @param seed   any finite number; integers up to 2^53 are used exactly (split into hi/lo)
   * @param stream stream selector (like PCG's `initseq`); different streams are independent
   */
  constructor(seed: number, stream = 54) {
    const seedLo = seed >>> 0;
    const seedHi = Math.floor(Math.abs(seed) / TWO32) >>> 0;
    const streamLo = stream >>> 0;
    const streamHi = Math.floor(Math.abs(stream) / TWO32) >>> 0;
    // inc = (stream << 1) | 1
    this.incHi = ((streamHi << 1) | (streamLo >>> 31)) >>> 0;
    this.incLo = ((streamLo << 1) | 1) >>> 0;
    this.hi = 0;
    this.lo = 0;
    this.step();
    [this.hi, this.lo] = add64(this.hi, this.lo, seedHi, seedLo);
    this.step();
  }

  static fromState(s: RngState): Rng {
    const r = new Rng(0);
    r.hi = s.hi >>> 0; r.lo = s.lo >>> 0; r.incHi = s.incHi >>> 0; r.incLo = s.incLo >>> 0;
    return r;
  }

  getState(): RngState {
    return { hi: this.hi, lo: this.lo, incHi: this.incHi, incLo: this.incLo };
  }

  private step(): void {
    const [mh, ml] = mul64(this.hi, this.lo, MULT_HI, MULT_LO);
    [this.hi, this.lo] = add64(mh, ml, this.incHi, this.incLo);
  }

  /** Uniform uint32. */
  nextU32(): number {
    const oh = this.hi, ol = this.lo;
    this.step();
    // xorshifted = (uint32)(((old >> 18) ^ old) >> 27)
    const sh = oh >>> 18;
    const sl = ((ol >>> 18) | (oh << 14)) >>> 0;
    const xh = (sh ^ oh) >>> 0;
    const xl = (sl ^ ol) >>> 0;
    const xorshifted = ((xl >>> 27) | (xh << 5)) >>> 0;
    const rot = oh >>> 27; // old >> 59
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  }

  /** Uniform float in [0, 1) with 32 bits of resolution. */
  next(): Scalar {
    return this.nextU32() * INV_TWO32;
  }

  /** Uniform float in [lo, hi). */
  range(lo: Scalar, hi: Scalar): Scalar {
    return lo + (hi - lo) * this.next();
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** true with probability p. */
  chance(p: Scalar): boolean {
    return this.next() < p;
  }

  /** Standard normal via Box–Muller using the deterministic log/cos. */
  gaussian(mean: Scalar = 0, sd: Scalar = 1): Scalar {
    let u1 = this.next();
    if (u1 < 1e-300) u1 = 1e-300; // avoid log(0)
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * log(u1)) * cos(TWO_PI * u2);
  }

  /** Pick a uniformly random element. Caller guarantees non-empty. */
  pick<T>(items: readonly T[]): T {
    const v = items[this.int(items.length)];
    if (v === undefined) throw new Error('Rng.pick on empty array');
    return v;
  }

  /** In-place Fisher–Yates. Deterministic given the stream. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = items[i] as T, b = items[j] as T;
      items[i] = b; items[j] = a;
    }
    return items;
  }

  /** Independent child stream, seeded from this stream. */
  fork(stream: number): Rng {
    return new Rng(this.nextU32() * TWO32 + this.nextU32(), stream);
  }
}
