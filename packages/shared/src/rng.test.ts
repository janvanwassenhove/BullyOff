import { describe, expect, it } from 'vitest';
import { Rng } from './rng.js';

/** Straightforward BigInt PCG32 reference (pcg32_srandom_r + pcg32_random_r). */
function* pcg32Reference(seed: bigint, seq: bigint): Generator<number> {
  const M = 0x5851f42d4c957f2dn;
  const MASK = (1n << 64n) - 1n;
  const inc = ((seq << 1n) | 1n) & MASK;
  let state = 0n;
  state = (state * M + inc) & MASK;
  state = (state + seed) & MASK;
  state = (state * M + inc) & MASK;
  for (;;) {
    const old = state;
    state = (old * M + inc) & MASK;
    const xorshifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    const rot = Number(old >> 59n);
    yield ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  }
}

describe('Rng (PCG32)', () => {
  it('matches the reference implementation for seed 42 / stream 54 (first outputs known from pcg32-demo)', () => {
    const r = new Rng(42, 54);
    // First six outputs of the official pcg32-demo with pcg32_srandom_r(&rng, 42u, 54u).
    const known = [0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e];
    for (const k of known) expect(r.nextU32()).toBe(k);
  });

  it('matches a BigInt reference over 10k draws for several seeds/streams', () => {
    for (const [seed, seq] of [[0, 0], [1, 1], [123456789, 7], [4294967295, 4294967295], [9007199254740991, 3]] as const) {
      const r = new Rng(seed, seq);
      const ref = pcg32Reference(BigInt(seed), BigInt(seq));
      for (let i = 0; i < 10_000; i++) {
        expect(r.nextU32()).toBe(ref.next().value);
      }
    }
  });

  it('is deterministic and serialisable mid-stream', () => {
    const a = new Rng(2024, 1);
    for (let i = 0; i < 100; i++) a.next();
    const snap = a.getState();
    const b = Rng.fromState(JSON.parse(JSON.stringify(snap)) as typeof snap);
    for (let i = 0; i < 1000; i++) expect(b.nextU32()).toBe(a.nextU32());
  });

  it('next() is in [0,1) and roughly uniform; gaussian has ~0 mean, ~1 sd', () => {
    const r = new Rng(7);
    let sum = 0, sumSq = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const u = r.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
    }
    expect(sum / N).toBeCloseTo(0.5, 1);
    sum = 0;
    for (let i = 0; i < N; i++) { const g = r.gaussian(); sum += g; sumSq += g * g; }
    expect(sum / N).toBeCloseTo(0, 1);
    expect(sumSq / N).toBeCloseTo(1, 1);
  });

  it('int(n) covers [0,n); shuffle is a permutation; fork is independent of parent draws', () => {
    const r = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.int(6));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);

    const p1 = new Rng(5), p2 = new Rng(5);
    const c1 = p1.fork(9);
    const c2 = p2.fork(9);
    p1.next(); // parent draws after fork must not affect the child
    expect(c1.nextU32()).toBe(c2.nextU32());
  });
});
