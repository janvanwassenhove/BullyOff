/**
 * Tempo of play (Jan's feedback after the first commercial build: "the ball and the play feel slow —
 * hockey is a fast, technical sport, especially on a watered pitch"). The physics were already right
 * (push 14 m/s, hit 36 m/s, sprint 8.6 m/s); the AI played slowly: passes were weighted to arrive at
 * a trappable 5.5–8.5 m/s and the carrier nudged the ball 1–3 m ahead and waited for it. These
 * numbers pin the tempo so a future tuning pass cannot quietly slow the game down again. (A faster dribble —
 * the ball 3–6 m/s ahead of the carrier — was measured too: it halves shots and goals because the rolling ball is
 * trapped by the next defender and is never at the feet to shoot, so the dribble model stayed as it was.)
 */
import { describe, expect, it } from 'vitest';
import { simulateMatch } from '../match/match.js';
import { aiController, squadsFromSetup } from '../ai/brain.js';
import { aiMatchSetup } from './fixtures.js';
import { MENS } from '../profile.js';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { FRAME_PLAYER_STRIDE, type MatchEvent, type MatchLog } from '../events/events.js';
import { matchStats } from './stats.js';

export interface Tempo { passLaunch: number; prod: number; ballLive: number; carrier: number; passes: number; goals: number; entries: number; pcs: number; shots: number }

/** Mean pass launch speed, dribble-prod speed, live-ball speed and carrier running speed over a match. */
export function tempoOf(log: MatchLog): Tempo {
  const struck = log.events.filter((e): e is Extract<MatchEvent, { t: 'BallStruck' }> => e.t === 'BallStruck');
  // a dribble touch leaves the stick under ~8 m/s; anything firmer is a pass, clear or shot
  const passes = struck.filter((e) => e.speed > 8 && e.kind !== 'flick');
  const prods = struck.filter((e) => e.kind === 'push' && e.speed <= 8);
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  let live = 0, sum = 0, carrierSum = 0, carrierN = 0;
  for (const f of log.frames) {
    const v = Math.hypot(f.ball[3] ?? 0, f.ball[4] ?? 0);
    if (v > 0.2) { live++; sum += v; }
    let best = 9, bv = 0;
    for (let p = 0; p < f.players.length / FRAME_PLAYER_STRIDE; p++) {
      const o = p * FRAME_PLAYER_STRIDE;
      const d = Math.hypot((f.players[o] ?? 0) - (f.ball[0] ?? 0), (f.players[o + 1] ?? 0) - (f.ball[1] ?? 0));
      if (d < best) { best = d; bv = Math.hypot(f.players[o + 2] ?? 0, f.players[o + 3] ?? 0); }
    }
    if (best < 1.5 && v < 4) { carrierSum += bv; carrierN++; }
  }
  const st = matchStats(log);
  return { passLaunch: mean(passes.map((e) => e.speed)), prod: mean(prods.map((e) => e.speed)), ballLive: sum / Math.max(1, live), carrier: carrierSum / Math.max(1, carrierN), passes: passes.length, goals: log.events.filter((e) => e.t === 'Goal').length, entries: st.circleEntries[0] + st.circleEntries[1], pcs: st.pcAwarded[0] + st.pcAwarded[1], shots: st.shots[0] + st.shots[1] };
}

function play(seed: number): MatchLog {
  const setup = { ...aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST), frameEvery: 4 };
  return simulateMatch(setup, seed, aiController(seed, squadsFromSetup(setup.players), { profile: MENS, surface: 'watered' }));
}

describe('tempo of play (watered turf, men)', () => {
  const tempos = [1, 2, 3, 4].map((s) => tempoOf(play(s)));
  const avg = (k: keyof Tempo): number => tempos.reduce((a, t) => a + t[k], 0) / tempos.length;
  it('prints the tempo table', () => {
    console.warn('tempo:', tempos.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 100) / 100]))));
    expect(tempos.length).toBe(4);
  });
  // 11.5 since 0.9.0: handedness means a share of every match's passes are struck off the reverse,
  // which is genuinely slower (player/handedness.ts). The guard's job is that the game does not go
  // back to the pedestrian 5.5–8.5 m/s rolls of the first build, and 11.5 still holds that line.
  it('passes are struck firmly: a push on water leaves the stick at 11.5 m/s or more on average', () => { expect(avg('passLaunch')).toBeGreaterThanOrEqual(11.5); });
  it('the ball itself is quick: live-ball mean speed ≥ 5.5 m/s', () => { expect(avg('ballLive')).toBeGreaterThanOrEqual(5.5); });
  // Calibration guard (docs/rules/calibration.md, men 4.9–5.9 goals per match over 96 matches; four matches are noisy, so the band is wide):
  // firmer passes must not turn the game into a shooting gallery or a stalemate.
  it('goals, shots and penalty corners stay in band', () => { expect(avg('goals')).toBeGreaterThanOrEqual(2.5); expect(avg('goals')).toBeLessThanOrEqual(8); expect(avg('shots')).toBeGreaterThanOrEqual(18); expect(avg('pcs')).toBeGreaterThanOrEqual(3); });
  // The Phase 10.5 calibration (docs/rules/calibration.md, 96-match runs): attacks actually reach the
  // circle now. Floor well under the measured ~26 because four matches are noisy — but a regression to
  // the pre-calibration ~13 must fail here, not in a season review.
  it('attacks reach the circle: ≥ 16 entries per match on average', () => { expect(avg('entries')).toBeGreaterThanOrEqual(16); });
});
