/**
 * Every simulation quantity is a `Scalar`, never a bare `number` (ADR-005 guardrail 2).
 * Today it is float64. If the representation ever has to change (only if ADR-011 is
 * reversed towards P2P lockstep), this alias is the single point of change.
 */
export type Scalar = number;

/** Metres. Documentary alias — the pitch is in SI (BRIEF §5.1). */
export type Metres = Scalar;
/** Seconds. */
export type Seconds = Scalar;
/** Metres per second. */
export type MetresPerSecond = Scalar;
/** Radians, in (-π, π]. */
export type Radians = Scalar;

export interface Vec2 {
  x: Scalar;
  y: Scalar;
}
export interface Vec3 {
  x: Scalar;
  y: Scalar;
  z: Scalar;
}

export const vec2 = (x: Scalar, y: Scalar): Vec2 => ({ x, y });
export const vec3 = (x: Scalar, y: Scalar, z: Scalar): Vec3 => ({ x, y, z });

export const add2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale2 = (a: Vec2, s: Scalar): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot2 = (a: Vec2, b: Vec2): Scalar => a.x * b.x + a.y * b.y;
export const cross2 = (a: Vec2, b: Vec2): Scalar => a.x * b.y - a.y * b.x;
export const len2 = (a: Vec2): Scalar => Math.sqrt(a.x * a.x + a.y * a.y);
export const dist2 = (a: Vec2, b: Vec2): Scalar => len2(sub2(a, b));
export const norm2 = (a: Vec2): Vec2 => {
  const l = len2(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: Vec3, s: Scalar): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot3 = (a: Vec3, b: Vec3): Scalar => a.x * b.x + a.y * b.y + a.z * b.z;
export const len3 = (a: Vec3): Scalar => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

export const clamp = (v: Scalar, lo: Scalar, hi: Scalar): Scalar => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: Scalar, b: Scalar, t: Scalar): Scalar => a + (b - a) * t;
