/**
 * Season worker: owns nothing between messages — the World comes in, a match
 * day (or the rest of the season) is played through the engine, the World goes
 * back (ADR-008: state crosses the boundary as data; the UI never simulates).
 */
import { advanceDay, engineRunner, newSeason, recordCoachedFixture, type World } from '@bullyoff/season';
import { decodeReplay } from '@bullyoff/engine';
import type { MatchLog } from '@bullyoff/engine';

export type ToSeason =
  | { type: 'day'; id: number; world: World; userClub: string | null }
  | { type: 'toEnd'; id: number; world: World; userClub: string | null }
  | { type: 'newSeason'; id: number; world: World }
  /** Phase 7: record a match the coach played live in the engine worker (log from that worker). */
  | { type: 'record'; id: number; world: World; fixtureId: number; log: MatchLog };
export type FromSeason =
  | { type: 'world'; id: number; world: World; userLog: MatchLog | null; playedFixtureIds: number[] }
  | { type: 'error'; id: number; message: string };

declare const self: { postMessage(m: FromSeason): void; onmessage: ((ev: { data: ToSeason }) => void) | null };

self.onmessage = (ev): void => {
  const m = ev.data;
  try {
    if (m.type === 'newSeason') { newSeason(m.world); self.postMessage({ type: 'world', id: m.id, world: m.world, userLog: null, playedFixtureIds: [] }); return; }
    if (m.type === 'record') { const f = recordCoachedFixture(m.world, m.fixtureId, m.log); self.postMessage({ type: 'world', id: m.id, world: m.world, userLog: m.log, playedFixtureIds: [f.id] }); return; }
    const w = m.world;
    let userLog: MatchLog | null = null;
    const played: number[] = [];
    const runDay = (): void => {
      const fx = advanceDay(w, { runner: engineRunner, keepReplayFor: m.userClub });
      for (const f of fx) { played.push(f.id); if (m.userClub && (f.home === m.userClub || f.away === m.userClub) && f.replay) userLog = decodeReplay(f.replay); }
    };
    if (m.type === 'day') { let guard = 0; do { runDay(); guard++; } while (!w.season.finished && played.length === 0 && guard < 10); }
    else { let guard = 0; while (!w.season.finished && guard++ < 400) runDay(); }
    self.postMessage({ type: 'world', id: m.id, world: w, userLog, playedFixtureIds: played });
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: e instanceof Error ? e.message : String(e) });
  }
};
