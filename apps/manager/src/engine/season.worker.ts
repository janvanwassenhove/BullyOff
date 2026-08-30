/**
 * Season worker: owns nothing between messages — the World comes in, a match
 * day (or the rest of the season) is played through the engine, the World goes
 * back (ADR-008: state crosses the boundary as data; the UI never simulates).
 */
import { advanceDay, createWorld, engineRunner, newSeason, recordCoachedFixture, type World, type WorldOptions } from '@bullyoff/season';
import { decodeReplay } from '@bullyoff/engine';
import type { MatchLog } from '@bullyoff/engine';

export type ToSeason =
  | { type: 'day'; id: number; world: World; userClub: string | null }
  | { type: 'toEnd'; id: number; world: World; userClub: string | null }
  | { type: 'newSeason'; id: number; world: World }
  /** Phase 8: generate a world (identities, squads, 20 seasons of history) off the UI thread. */
  | { type: 'create'; id: number; seed: number; profile: 'mens' | 'womens'; opts: WorldOptions }
  /** Phase 7: record a match the coach played live in the engine worker (log from that worker). */
  | { type: 'record'; id: number; world: World; fixtureId: number; log: MatchLog };
export type FromSeason =
  | { type: 'world'; id: number; world: World; userLog: MatchLog | null; playedFixtureIds: number[] }
  /** Progress while a long request runs (match days played so far / days left in the season). */
  | { type: 'progress'; id: number; done: number; total: number; label: string }
  | { type: 'error'; id: number; message: string };

declare const self: { postMessage(m: FromSeason): void; onmessage: ((ev: { data: ToSeason }) => void) | null };

self.onmessage = (ev): void => {
  const m = ev.data;
  try {
    if (m.type === 'create') { const world = createWorld(m.seed, m.profile, m.opts); self.postMessage({ type: 'world', id: m.id, world, userLog: null, playedFixtureIds: [] }); return; }
    if (m.type === 'newSeason') { newSeason(m.world); self.postMessage({ type: 'world', id: m.id, world: m.world, userLog: null, playedFixtureIds: [] }); return; }
    if (m.type === 'record') { const f = recordCoachedFixture(m.world, m.fixtureId, m.log); self.postMessage({ type: 'world', id: m.id, world: m.world, userLog: m.log, playedFixtureIds: [f.id] }); return; }
    const w = m.world;
    let userLog: MatchLog | null = null;
    const played: number[] = [];
    const total = Math.max(1, w.season.days - w.season.day);
    let days = 0;
    const runDay = (perFixture: boolean): void => {
      const fx = advanceDay(w, {
        runner: engineRunner, keepReplayFor: m.userClub,
        // one sim day takes real seconds: for a single-day sim, report every fixture as it starts
        ...(perFixture ? { onFixture: (i: number, n: number, f: { home: string; away: string }) => { self.postMessage({ type: 'progress', id: m.id, done: i, total: n, label: `${w.clubs[f.home]?.short ?? f.home} — ${w.clubs[f.away]?.short ?? f.away}` }); } } : {}),
      });
      days++;
      if (!perFixture) self.postMessage({ type: 'progress', id: m.id, done: days, total, label: `day ${w.season.day}/${w.season.days}` });
      for (const f of fx) { played.push(f.id); if (m.userClub && (f.home === m.userClub || f.away === m.userClub) && f.replay) userLog = decodeReplay(f.replay); }
    };
    if (m.type === 'day') { let guard = 0; do { runDay(true); guard++; } while (!w.season.finished && played.length === 0 && guard < 10); }
    else { let guard = 0; while (!w.season.finished && guard++ < 400) runDay(false); }
    self.postMessage({ type: 'world', id: m.id, world: w, userLog, playedFixtureIds: played });
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: e instanceof Error ? e.message : String(e) });
  }
};
