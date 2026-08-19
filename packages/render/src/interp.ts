/**
 * Interpolation buffer (ADR-013): sample the kinematic state at any fractional
 * tick from a frame list of arbitrary cadence (full-tick live frames or 5 Hz
 * keyframes). Positions lerp; headings/stick take the shortest arc; the ball's z
 * follows a parabola between keyframes when both endpoints are airborne-ish.
 * Pure — tested in Node.
 */
import { FRAME_PLAYER_STRIDE, type Frame } from '@bullyoff/engine';

export interface PlayerSample { x: number; y: number; heading: number; stick: number; stamina: number }
export interface Sample { tick: number; ball: { x: number; y: number; z: number }; players: PlayerSample[] }

const wrap = (a: number): number => { let r = a % (2 * Math.PI); if (r > Math.PI) r -= 2 * Math.PI; if (r <= -Math.PI) r += 2 * Math.PI; return r; };
const lerpAngle = (a: number, b: number, t: number): number => a + wrap(b - a) * t;

/** Binary search: index of the last frame with tick ≤ t (or 0). */
export function frameIndexAt(frames: readonly Frame[], t: number): number {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0) return -1;
  if (t <= (frames[0]?.tick ?? 0)) return 0;
  if (t >= (frames[hi]?.tick ?? 0)) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((frames[mid]?.tick ?? 0) <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function sampleAt(frames: readonly Frame[], t: number, nPlayers: number): Sample | null {
  const i = frameIndexAt(frames, t);
  if (i < 0) return null;
  const a = frames[i]; const b = frames[Math.min(i + 1, frames.length - 1)];
  if (!a || !b) return null;
  const span = b.tick - a.tick;
  const u = span > 0 ? Math.max(0, Math.min(1, (t - a.tick) / span)) : 0;
  const players: PlayerSample[] = new Array<PlayerSample>(nPlayers);
  for (let p = 0; p < nPlayers; p++) {
    const o = p * FRAME_PLAYER_STRIDE;
    players[p] = {
      x: (a.players[o] ?? 0) + ((b.players[o] ?? 0) - (a.players[o] ?? 0)) * u,
      y: (a.players[o + 1] ?? 0) + ((b.players[o + 1] ?? 0) - (a.players[o + 1] ?? 0)) * u,
      heading: lerpAngle(a.players[o + 4] ?? 0, b.players[o + 4] ?? 0, u),
      stick: lerpAngle(a.players[o + 5] ?? 0, b.players[o + 5] ?? 0, u),
      stamina: (a.players[o + 6] ?? 1) + ((b.players[o + 6] ?? 1) - (a.players[o + 6] ?? 1)) * u,
    };
  }
  const za = a.ball[2] ?? 0, zb = b.ball[2] ?? 0;
  // parabolic z when the ball is in the air between keyframes: peak inferred from endpoints and gravity over the span
  let z = za + (zb - za) * u;
  if (span > 1 && (za > 0.02 || zb > 0.02)) {
    const dt = span / 20; const g = 9.81;
    // z(u) = za + (zb - za + 0.5 g dt²) u − 0.5 g dt² u²
    z = za + (zb - za + 0.5 * g * dt * dt) * u - 0.5 * g * dt * dt * u * u;
    if (z < 0) z = 0;
  }
  return {
    tick: t,
    ball: { x: (a.ball[0] ?? 0) + ((b.ball[0] ?? 0) - (a.ball[0] ?? 0)) * u, y: (a.ball[1] ?? 0) + ((b.ball[1] ?? 0) - (a.ball[1] ?? 0)) * u, z },
    players,
  };
}
