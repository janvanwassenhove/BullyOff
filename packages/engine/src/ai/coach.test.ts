/**
 * Phase 7: coaching from the bench. Instructions are tick-stamped data applied by the AI;
 * the same setup + seed + instructions reproduce the same log, and the coached step-wise
 * worker host is bit-identical to the one-shot simulateMatch path.
 */
import { describe, expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { aiMatchSetup } from '../sim/fixtures.js';
import { hashLog } from '../sim/hash.js';
import { matchStats, quarterStats } from '../sim/stats.js';
import { simulateMatch, type MatchSetup } from '../match/match.js';
import { createAi, aiController, squadsFromSetup, type CoachInstruction } from './brain.js';
import { DEFAULT_TACTICS, type TeamTactics } from './tactics.js';
import { getProfile } from '../profile.js';
import { createEngineHost } from '../worker/host.js';
import type { FromEngine } from '../worker/protocol.js';
import type { Frame, MatchEvent, MatchLog } from '../events/events.js';

const setup = (): MatchSetup => ({ ...aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST, 12), frameEvery: 0 });
const tactics = (): [TeamTactics, TeamTactics] => [{ ...DEFAULT_TACTICS }, { ...DEFAULT_TACTICS }];

function coached(seed: number, ins: readonly CoachInstruction[], maxTicks = 20 * 60 * 15): MatchLog {
  const s = setup();
  const ai = createAi(seed, squadsFromSetup(s.players, tactics()), { profile: getProfile('mens'), surface: 'watered' });
  ai.instruct(ins);
  return simulateMatch(s, seed, ai.controller, maxTicks);
}

describe('coach instructions', () => {
  it('a substitution instruction becomes a legal Substitution event with the named players; identical instructions → identical logs', () => {
    const s = setup();
    const bench = s.players.filter((p) => p.team === 0 && p.onPitch === false).map((p) => p.id);
    const starters = s.players.filter((p) => p.team === 0 && (p.onPitch ?? true) && !p.isGoalkeeper).map((p) => p.id);
    expect(bench.length).toBeGreaterThan(0);
    const ins: CoachInstruction[] = [{ tick: 20 * 60, team: 0, kind: 'substitute', outId: starters[3]!, inId: bench[0]! }];
    const a = coached(5, ins), b = coached(5, ins);
    expect(hashLog(a)).toBe(hashLog(b));
    const sub = a.events.find((e): e is Extract<MatchEvent, { t: 'Substitution' }> => e.t === 'Substitution' && e.team === 0 && e.inId === bench[0]);
    expect(sub).toBeDefined();
    expect(sub?.outId).toBe(starters[3]);
    expect(sub!.tick).toBeGreaterThan(20 * 60);
  }, 60_000);

  it('a tactics instruction changes the match (different log) but not its determinism; tactics() reflects it after its tick', () => {
    const base = coached(9, []);
    const pressed = coached(9, [{ tick: 10, team: 0, kind: 'tactics', patch: { pressHeight: 0.95, tempo: 0.9, buildUp: 'direct' } }]);
    expect(hashLog(pressed)).not.toBe(hashLog(base));
    expect(hashLog(coached(9, [{ tick: 10, team: 0, kind: 'tactics', patch: { pressHeight: 0.95, tempo: 0.9, buildUp: 'direct' } }]))).toBe(hashLog(pressed));
    const s = setup();
    const ai = createAi(1, squadsFromSetup(s.players, tactics()));
    ai.instruct([{ tick: 5, team: 1, kind: 'tactics', patch: { pcVariant: 'lowHit', pcBattery: { striker: 101 } } }]);
    expect(ai.tactics(1).pcVariant).toBe('dragFlick');
    simulateMatch(s, 1, ai.controller, 10);
    expect(ai.tactics(1).pcVariant).toBe('lowHit');
    expect(ai.tactics(1).pcBattery?.striker).toBe(101);
    expect(ai.tactics(0).pcVariant).toBe('dragFlick');
  }, 180_000);

  it('the AI rotates on stamina now: tired players go off, fresher ones come on, and the bench recovers', () => {
    // Averaged over two seeds: whether a given half-hour throws up three legal moments for a tired
    // man to come off is one roll of the dice, and the claim under test is that the AI rotates at all.
    let total = 0, back = false;
    for (const seed of [3, 4]) {
      const log = coached(seed, [{ tick: 0, team: 0, kind: 'tactics', patch: { rotateBelowStamina: 0.8 } }], 20 * 60 * 30);
      const subs = log.events.filter((e): e is Extract<MatchEvent, { t: 'Substitution' }> => e.t === 'Substitution');
      total += subs.filter((e) => e.team === 0).length;
      // a player who went off can come back on later (recovered on the bench)
      back ||= subs.some((e, i) => subs.slice(0, i).some((prev) => prev.team === e.team && prev.outId === e.inId));
    }
    expect(total).toBeGreaterThan(4);
    expect(back).toBe(true);
  }, 90_000);
});

describe('coached worker host', () => {
  it('initAi + advance in chunks + instruct reproduces the one-shot simulateMatch log with the same instructions', () => {
    const seed = 21;
    const ins: CoachInstruction[] = [
      { tick: 300, team: 0, kind: 'tactics', patch: { pressHeight: 0.9 } },
      { tick: 900, team: 1, kind: 'tactics', patch: { defensiveLine: 0.2, tempo: 0.8 } },
    ];
    const s = setup(); s.frameEvery = 40;
    const ai = createAi(seed, squadsFromSetup(s.players, tactics()), { profile: getProfile('mens'), surface: 'watered' });
    ai.instruct(ins);
    const ticks = 20 * 60 * 6;
    const oneShot = simulateMatch(s, seed, ai.controller, ticks);

    const out: FromEngine[] = [];
    const host = createEngineHost((m) => out.push(m));
    host.handle({ type: 'initAi', id: 1, setup: setup(), seed, tactics: tactics() });
    const ready = out.find((m) => m.type === 'ready');
    expect(ready?.type).toBe('ready');
    host.handle({ type: 'instruct', id: 2, instructions: ins });
    expect(out.at(-1)?.type).toBe('instructed');
    const events: MatchEvent[] = ready?.type === 'ready' ? [...ready.events] : [];
    const frames: Frame[] = [];
    // frameEvery is a setup field: re-init with it to compare frames too
    out.length = 0;
    const s2 = setup(); s2.frameEvery = 40;
    host.handle({ type: 'initAi', id: 3, setup: s2, seed, tactics: tactics() });
    host.handle({ type: 'instruct', id: 4, instructions: ins });
    events.length = 0; const r2 = out.find((m) => m.type === 'ready'); if (r2?.type === 'ready') events.push(...r2.events);
    for (let t = 0; t < ticks; t += 250) { out.length = 0; host.handle({ type: 'advance', id: 10 + t, ticks: Math.min(250, ticks - t) }); const m = out[0]; if (m?.type === 'events') { events.push(...m.events); frames.push(...m.frames); } }
    out.length = 0; host.handle({ type: 'end', id: 999 }); const e = out[0]; if (e?.type === 'ended') events.push(...e.events);
    const stepped: MatchLog = { header: oneShot.header, events, frames };
    expect(hashLog(stepped)).toBe(hashLog(oneShot));
    expect(frames.length).toBe(oneShot.frames.length);
  }, 90_000);
});

describe('quarter briefings', () => {
  it('quarterStats splits the match into four quarters whose sums match matchStats', () => {
    const s = setup();
    const log = simulateMatch(s, 4, aiController(4, squadsFromSetup(s.players), { profile: getProfile('mens'), surface: 'watered' }));
    const q = quarterStats(log), m = matchStats(log);
    expect(q.map((x) => x.quarter)).toEqual([1, 2, 3, 4]);
    const sum = (k: 'goals' | 'shots' | 'circleEntries' | 'pcAwarded'): [number, number] => q.reduce<[number, number]>((a, x) => [a[0] + x[k][0], a[1] + x[k][1]], [0, 0]);
    expect(sum('goals')).toEqual(m.goals);
    expect(sum('shots')).toEqual(m.shots);
    expect(sum('circleEntries')).toEqual(m.circleEntries);
    expect(sum('pcAwarded')).toEqual(m.pcAwarded);
    for (const x of q) { expect(x.possession[0] + x.possession[1]).toBeCloseTo(1, 6); expect(x.touches[0] + x.touches[1]).toBeGreaterThan(50); }
  }, 120_000);
});
