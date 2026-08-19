/**
 * Replay storage format (ADR-007 follow-up, decided in Phase 5):
 *
 *   ReplayFile v1 = header + events (append-only schema, verbatim) + keyframes:
 *   quantised kinematics every `every` ticks (default 4 → 5 Hz), positions in
 *   centimetres (int), angles in milliradians (int), stamina in permille.
 *   Velocities are NOT stored: the renderer interpolates positions between
 *   keyframes (hermite from finite differences is enough at 5 Hz for players;
 *   the ball uses linear + the z parabola). ~99 ints per keyframe × 21 000
 *   keyframes ≈ 8 MB as JSON for a full match, ≈ 1.5 MB gzip — vs ~250 MB for
 *   full-tick float frames.
 *
 * `decode` returns a MatchLog whose `frames` are the keyframes (sparse ticks);
 * `frames[i].players` uses FRAME_PLAYER_STRIDE with vx/vy = 0. Consumers must
 * interpolate by tick, never assume frames are per tick.
 */
import { FRAME_PLAYER_STRIDE, type Frame, type MatchLog, type MatchLogHeader, type MatchEvent } from '../events/events.js';

export interface ReplayFile {
  format: 'bullyoff-replay-file';
  version: 1;
  header: MatchLogHeader;
  events: MatchEvent[];
  keyframes: {
    every: number;
    /** tick of keyframe i */
    ticks: number[];
    /** per keyframe: [x_cm, y_cm, z_cm] */
    ball: number[];
    /** per keyframe, per player (header order): [x_cm, y_cm, heading_mrad, stick_mrad, stamina_permille] */
    players: number[];
  };
}

export const KEYFRAME_PLAYER_STRIDE = 5;

const q = (v: number, scale: number): number => Math.round(v * scale);

/** Encode a full-frame log into a keyframed replay file. */
export function encodeReplay(log: MatchLog, every = 4): ReplayFile {
  const ticks: number[] = [], ball: number[] = [], players: number[] = [];
  const nP = log.header.playerIds.length;
  for (const f of log.frames) {
    if (f.tick % every !== 0) continue;
    ticks.push(f.tick);
    ball.push(q(f.ball[0] ?? 0, 100), q(f.ball[1] ?? 0, 100), q(f.ball[2] ?? 0, 100));
    for (let i = 0; i < nP; i++) {
      const o = i * FRAME_PLAYER_STRIDE;
      players.push(q(f.players[o] ?? 0, 100), q(f.players[o + 1] ?? 0, 100), q(f.players[o + 4] ?? 0, 1000), q(f.players[o + 5] ?? 0, 1000), q(f.players[o + 6] ?? 1, 1000));
    }
  }
  return { format: 'bullyoff-replay-file', version: 1, header: log.header, events: log.events, keyframes: { every, ticks, ball, players } };
}

/** Decode into a MatchLog with sparse keyframe frames (velocities zero). */
export function decodeReplay(file: ReplayFile): MatchLog {
  if ((file as { format: string }).format !== 'bullyoff-replay-file') throw new Error('not a bullyoff replay file');
  const nP = file.header.playerIds.length;
  const frames: Frame[] = [];
  const k = file.keyframes;
  for (let i = 0; i < k.ticks.length; i++) {
    const b = i * 3, p0 = i * nP * KEYFRAME_PLAYER_STRIDE;
    const players = new Array<number>(nP * FRAME_PLAYER_STRIDE);
    for (let j = 0; j < nP; j++) {
      const s = p0 + j * KEYFRAME_PLAYER_STRIDE, o = j * FRAME_PLAYER_STRIDE;
      players[o] = (k.players[s] ?? 0) / 100; players[o + 1] = (k.players[s + 1] ?? 0) / 100;
      players[o + 2] = 0; players[o + 3] = 0;
      players[o + 4] = (k.players[s + 2] ?? 0) / 1000; players[o + 5] = (k.players[s + 3] ?? 0) / 1000; players[o + 6] = (k.players[s + 4] ?? 1000) / 1000;
    }
    frames.push({ tick: k.ticks[i] ?? 0, ball: [(k.ball[b] ?? 0) / 100, (k.ball[b + 1] ?? 0) / 100, (k.ball[b + 2] ?? 0) / 100, 0, 0, 0], players });
  }
  return { header: { ...file.header, frameEvery: k.every }, events: file.events, frames };
}
