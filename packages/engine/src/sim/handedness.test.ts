/**
 * Handedness in a real match (§6, acceptance table §8). The pure factors are pinned in
 * player/handedness.test.ts; these are the claims a coach would make about the *game*, measured
 * over played minutes rather than asserted about a formula:
 *
 *   · the reverse costs you — a ball arriving on a man's reverse is controlled less often
 *   · the tackle side matters — from the carrier's open stick side you win it more often
 *
 * The pressing angle itself is geometry and is proven exactly in ai/press.test.ts (jockeySpot). Its
 * emergent version — how much forward progress a shepherded carrier loses on his open stick — was
 * measured here too and deliberately left out: over four matches the ratio swings either side of 1,
 * which is a statement about the sample size and not about hockey.
 *
 * Whole frames are affordable because each seed is a few minutes: the side of a contact can only be
 * read from the tick before it, which needs `frameEvery: 1`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TACTICS, type PressId } from '../ai/tactics.js';
import { aiController, squadsFromSetup } from '../ai/brain.js';
import { aiMatchSetup } from './fixtures.js';
import { simulateMatch } from '../match/match.js';
import { MENS } from '../profile.js';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { FRAME_PLAYER_STRIDE, type MatchLog } from '../events/events.js';
import { lateralOf } from '../player/handedness.js';

const MINUTES = 6;

function play(seed: number, press: PressId = 'half'): MatchLog {
  const setup = { ...aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST), frameEvery: 1 };
  const tactics = [{ ...DEFAULT_TACTICS, press }, { ...DEFAULT_TACTICS, press }] as [typeof DEFAULT_TACTICS, typeof DEFAULT_TACTICS];
  return simulateMatch(setup, seed, aiController(seed, squadsFromSetup(setup.players, tactics), { profile: MENS, surface: 'watered' }), 20 * 60 * MINUTES);
}

/** Position, heading and velocity of every player (and the ball) at a tick, from the frame log. */
function stateAt(log: MatchLog, tick: number): { pos: Map<number, { x: number; y: number }>; head: Map<number, number>; vel: Map<number, { x: number; y: number }>; ball: { x: number; y: number }; ballSpeed: number } | null {
  const f = log.frames[tick];
  if (f?.tick !== tick) return null;
  const pos = new Map<number, { x: number; y: number }>(), head = new Map<number, number>(), vel = new Map<number, { x: number; y: number }>();
  log.header.playerIds.forEach((id, i) => {
    const o = i * FRAME_PLAYER_STRIDE;
    pos.set(id, { x: f.players[o] ?? 0, y: f.players[o + 1] ?? 0 });
    vel.set(id, { x: f.players[o + 2] ?? 0, y: f.players[o + 3] ?? 0 });
    head.set(id, f.players[o + 4] ?? 0);
  });
  return { pos, head, vel, ball: { x: f.ball[0] ?? 0, y: f.ball[1] ?? 0 }, ballSpeed: Math.hypot(f.ball[3] ?? 0, f.ball[4] ?? 0) };
}

describe('handedness in a played match', () => {
  // Contacts are rare per minute, so the two contact tests stream over eight seeds and keep only
  // their counters — whole frames for eight matches at once would not be worth the memory.
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  it('the reverse costs you: a ball arriving on the reverse is controlled less often', () => {
    let openN = 0, openClean = 0, revN = 0, revClean = 0;
    for (const seed of SEEDS) {
      const log = play(seed);
      for (const e of log.events) {
        if (e.t !== 'BallTrapped') continue;
        const st = stateAt(log, e.tick - 1);
        const p = st?.pos.get(e.playerId), h = st?.head.get(e.playerId);
        if (!st || !p || h === undefined) continue;
        // Matched difficulty: only balls arriving at a real pass speed. Without the band the two
        // buckets are not the same test — a man standing over a rolling ball controls it either way.
        if (st.ballSpeed < 6 || st.ballSpeed > 18) continue;
        // where the ball sat the instant before contact, relative to where he was facing
        const lat = lateralOf(h, p, st.ball);
        if (Math.abs(lat) < 0.3) continue; // in front of him: neither side, not what this measures
        if (lat > 0) { revN++; if (e.clean !== false) revClean++; } else { openN++; if (e.clean !== false) openClean++; }
      }
    }
    expect(openN).toBeGreaterThan(50);
    expect(revN).toBeGreaterThan(50);
    const openRate = openClean / openN, revRate = revClean / revN;
    console.warn(`receiving: forehand ${(100 * openRate).toFixed(1)} % clean (n=${openN}) · reverse ${(100 * revRate).toFixed(1)} % (n=${revN})`);
    expect(revRate).toBeLessThan(openRate);
  }, 120_000);

  /**
   * Only the win rate is asserted here. The foul side of the claim is real and is pinned exactly in
   * player/handedness.test.ts (`tackleSideOdds`), but a played match yields a handful of fouls per
   * side in open play — 5 against 2 is noise, and asserting it here would be asserting a coin toss.
   */
  it('the tackle side matters: from the open stick side you win it more often', () => {
    let openN = 0, openWon = 0, openFoul = 0, acrossN = 0, acrossWon = 0, acrossFoul = 0;
    // Twice the seeds of the receiving test: a tackle across the body in open play is *rare* now —
    // the AI shepherds onto the reverse and its defenders wait for the clean side — so the bucket
    // this claim needs has to be filled from more matches.
    for (const seed of [...SEEDS, 9, 10, 11, 12, 13, 14, 15, 16]) {
      const log = play(seed);
      for (const e of log.events) {
        if (e.t !== 'Tackle') continue;
        const st = stateAt(log, e.tick - 1);
        const c = st?.pos.get(e.carrierId), t = st?.pos.get(e.tacklerId), h = st?.head.get(e.carrierId);
        if (!st || !c || !t || h === undefined) continue;
        // Open play only. Inside a 23 the defence lunges from whatever side it can reach and the
        // fouls of the circle (feet, sticks in a scramble) swamp the comparison — the same reason the
        // receiving test bands ball speed: two buckets have to be the same test.
        if (Math.abs(c.x) > 22.9) continue;
        const lat = lateralOf(h, c, t); // where the tackler stood, from the carrier's point of view
        const foul = e.outcome === 'foulTackler' || e.outcome === 'foulCarrier';
        if (lat > 0) { acrossN++; if (e.outcome === 'won') acrossWon++; if (foul) acrossFoul++; }
        else { openN++; if (e.outcome === 'won') openWon++; if (foul) openFoul++; }
      }
    }
    console.warn(`tackles: open stick ${openWon}/${openN} won, ${openFoul} fouls · across the body ${acrossWon}/${acrossN} won, ${acrossFoul} fouls`);
    expect(openN).toBeGreaterThan(25);
    expect(acrossN).toBeGreaterThan(12);
    expect(openWon / openN).toBeGreaterThan(acrossWon / acrossN);
  }, 120_000);

});
