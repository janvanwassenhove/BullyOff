/**
 * Deterministic elementary functions for the engine (ADR-005).
 *
 * `Math.sin/cos/tan/atan2/exp/log/pow` are implementation-defined in precision
 * (ECMA-262 §21.3.2) and differ across V8 / JSC / SpiderMonkey in the last bits.
 * Everything here is built from `+ - * /`, `Math.sqrt`, `Math.floor`, comparisons
 * and integer ops — all of which are exactly specified — so results are
 * bit-identical on every conforming engine.
 *
 * Accuracy: ~1e-12 relative for exp/log/atan2, ~1e-12 absolute for sin/cos on
 * |x| ≤ 4π (hockey angles never exceed that). The test file compares against the
 * native functions with a documented tolerance; that test file is the only place
 * in this workspace where native transcendental `Math.*` may be called.
 *
 * Do NOT "optimise" these back to `Math.*` — the ESLint guardrail exists for a reason.
 */
import type { Radians, Scalar } from '../scalar.js';

export const PI: Scalar = 3.141592653589793;
export const TWO_PI: Scalar = 6.283185307179586;
export const HALF_PI: Scalar = 1.5707963267948966;
export const LN2: Scalar = 0.6931471805599453;
export const SQRT2: Scalar = 1.4142135623730951;
export const SQRT_HALF: Scalar = 0.7071067811865476;
export const DEG2RAD: Scalar = PI / 180;
export const RAD2DEG: Scalar = 180 / PI;

/** Wrap an angle into (-π, π]. Exact arithmetic only. */
export function wrapAngle(a: Radians): Radians {
  // floor is exactly specified; this is fmod without fmod.
  let r = a - TWO_PI * Math.floor((a + PI) / TWO_PI);
  if (r <= -PI) r += TWO_PI;
  return r;
}

/** Shortest signed angular difference b - a, in (-π, π]. */
export function angleDelta(a: Radians, b: Radians): Radians {
  return wrapAngle(b - a);
}

// ── sin / cos ────────────────────────────────────────────────────────────────
// Range-reduce to [-π/4, π/4] by quadrant, then Taylor to degree 15 (sin) / 14 (cos).
// On that interval the truncation error is < 1e-16 — far below float64 rounding.

const S3 = -1 / 6, S5 = 1 / 120, S7 = -1 / 5040, S9 = 1 / 362880,
  S11 = -1 / 39916800, S13 = 1 / 6227020800, S15 = -1 / 1307674368000;
const C2 = -1 / 2, C4 = 1 / 24, C6 = -1 / 720, C8 = 1 / 40320,
  C10 = -1 / 3628800, C12 = 1 / 479001600, C14 = -1 / 87178291200;

function sinKernel(r: Scalar): Scalar {
  const r2 = r * r;
  return r * (1 + r2 * (S3 + r2 * (S5 + r2 * (S7 + r2 * (S9 + r2 * (S11 + r2 * (S13 + r2 * S15)))))));
}
function cosKernel(r: Scalar): Scalar {
  const r2 = r * r;
  return 1 + r2 * (C2 + r2 * (C4 + r2 * (C6 + r2 * (C8 + r2 * (C10 + r2 * (C12 + r2 * C14))))));
}

/** Quadrant reduction: returns [quadrant mod 4, remainder in [-π/4, π/4]]. */
function reduce(x: Scalar): [number, Scalar] {
  const k = Math.floor(x / HALF_PI + 0.5); // nearest multiple of π/2
  // Two-constant (Cody–Waite) reduction keeps the remainder accurate for larger |x|.
  const r = (x - k * 1.5707963267341256) - k * 6.077100506506192e-11;
  return [((k % 4) + 4) % 4, r];
}

export function sin(x: Radians): Scalar {
  const [q, r] = reduce(x);
  switch (q) {
    case 0: return sinKernel(r);
    case 1: return cosKernel(r);
    case 2: return -sinKernel(r);
    default: return -cosKernel(r);
  }
}

export function cos(x: Radians): Scalar {
  const [q, r] = reduce(x);
  switch (q) {
    case 0: return cosKernel(r);
    case 1: return -sinKernel(r);
    case 2: return -cosKernel(r);
    default: return sinKernel(r);
  }
}

export function tan(x: Radians): Scalar {
  return sin(x) / cos(x);
}

// ── atan / atan2 ─────────────────────────────────────────────────────────────
// Reduce |t| ≤ 1 by two argument-halvings (each uses only sqrt), then Taylor to
// degree 15. After halving twice |t| ≤ tan(π/16) ≈ 0.199, so the truncation
// error is < 0.199^17/17 ≈ 6e-14.

function atanKernel(t: Scalar): Scalar {
  const t2 = t * t;
  return t * (1 - t2 * (1 / 3 - t2 * (1 / 5 - t2 * (1 / 7 - t2 * (1 / 9 - t2 * (1 / 11 - t2 * (1 / 13 - t2 * (1 / 15))))))));
}

export function atan(t: Scalar): Scalar {
  if (t < 0) return -atan(-t);
  if (t > 1) return HALF_PI - atan(1 / t);
  // Two halvings: atan(t) = 2·atan(t / (1 + sqrt(1 + t²)))
  const t1 = t / (1 + Math.sqrt(1 + t * t));
  const t2 = t1 / (1 + Math.sqrt(1 + t1 * t1));
  return 4 * atanKernel(t2);
}

export function atan2(y: Scalar, x: Scalar): Radians {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  // x === 0
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

// ── exp / log / pow ──────────────────────────────────────────────────────────

/** 2^k for integer k, exact (repeated doubling/halving — no Math.pow). */
export function pow2i(k: number): Scalar {
  let r = 1;
  if (k >= 0) { for (let i = 0; i < k; i++) r *= 2; }
  else { for (let i = 0; i < -k; i++) r *= 0.5; }
  return r;
}

export function exp(x: Scalar): Scalar {
  if (x > 709.78) return Infinity;
  if (x < -745.13) return 0;
  // x = k·ln2 + r, |r| ≤ ln2/2
  const k = Math.floor(x / LN2 + 0.5);
  const r = (x - k * 0.6931471803691238) - k * 1.9082149292705877e-10;
  // Taylor to degree 13 on |r| ≤ 0.347: error < 0.347^14/14! ≈ 4e-18
  const p = 1 + r * (1 + r * (1 / 2 + r * (1 / 6 + r * (1 / 24 + r * (1 / 120 + r * (1 / 720
    + r * (1 / 5040 + r * (1 / 40320 + r * (1 / 362880 + r * (1 / 3628800 + r * (1 / 39916800
    + r * (1 / 479001600 + r * (1 / 6227020800)))))))))))));
  return p * pow2i(k);
}

const F64 = new DataView(new ArrayBuffer(8));
/** Decompose x = m · 2^e with m ∈ [1, 2). Uses explicit big-endian DataView (endian-safe). */
function frexp1(x: Scalar): [Scalar, number] {
  F64.setFloat64(0, x, false);
  const hi = F64.getUint32(0, false);
  const expBits = (hi >>> 20) & 0x7ff;
  if (expBits === 0) {
    // subnormal: scale up and recurse once
    const [m, e] = frexp1(x * 18014398509481984); // 2^54
    return [m, e - 54];
  }
  const e = expBits - 1023;
  F64.setUint32(0, (hi & 0x800fffff) | (1023 << 20), false);
  return [F64.getFloat64(0, false), e];
}

export function log(x: Scalar): Scalar {
  if (x < 0 || x !== x) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let [m, e] = frexp1(x);
  // shift m into [√½, √2) so the atanh argument is small
  if (m > SQRT2) { m *= 0.5; e += 1; }
  const s = (m - 1) / (m + 1); // |s| ≤ 0.1716
  const s2 = s * s;
  // 2·atanh(s) = 2·(s + s³/3 + s⁵/5 + …), to s^15: error < 2·0.1716^17/17 ≈ 1e-14
  const series = 2 * s * (1 + s2 * (1 / 3 + s2 * (1 / 5 + s2 * (1 / 7 + s2 * (1 / 9 + s2 * (1 / 11 + s2 * (1 / 13 + s2 * (1 / 15))))))));
  return series + e * LN2;
}

/** a^n for integer n by repeated squaring — exact arithmetic, no exp/log round-trip. */
export function powi(a: Scalar, n: number): Scalar {
  if (n < 0) return 1 / powi(a, -n);
  let result = 1;
  let base = a;
  let k = n;
  while (k > 0) {
    if (k & 1) result *= base;
    base *= base;
    k >>>= 1;
  }
  return result;
}

/** General a^b for a > 0. Prefer powi() when b is an integer. */
export function pow(a: Scalar, b: Scalar): Scalar {
  if (b === 0) return 1;
  if (a === 0) return b > 0 ? 0 : Infinity;
  if (Number.isInteger(b) && Math.abs(b) <= 64) return powi(a, b);
  return exp(b * log(a));
}

/** Hypotenuse via sqrt (exact); do not use Math.hypot (implementation-defined). */
export function hypot(x: Scalar, y: Scalar): Scalar {
  return Math.sqrt(x * x + y * y);
}
