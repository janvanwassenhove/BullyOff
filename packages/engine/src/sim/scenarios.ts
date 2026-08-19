/**
 * Scenario fixtures (BRIEF §6.2, ADR-010 layer 4): named hockey situations as
 * data — setup + seed + starting placements + tactics + duration — replayable on
 * demand for the coach review panel (Phase 5 viewer) and tracked as regressions
 * (scenarios.test.ts hashes each). Any change that alters a scenario's log must
 * be reviewed, not auto-accepted.
 *
 * Coordinates: home (team 0, ids 1–11 + bench 23–27) attacks +x; away (12–22, 28–32) attacks −x.
 */
import { CIRCLE_TOP_X, HALF_LENGTH, LINE_23_X, PENALTY_SPOT_X, dmath } from '@bullyoff/shared';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import type { Command } from '../match/commands.js';
import { simulateMatch, type Controller, type MatchSetup } from '../match/match.js';
import type { MatchLog } from '../events/events.js';
import { getProfile } from '../profile.js';
import { aiController, squadsFromSetup } from '../ai/brain.js';
import { DEFAULT_TACTICS, type TeamTactics } from '../ai/tactics.js';
import { aiSquads } from './fixtures.js';

export interface Scenario {
  id: string;
  title: string;
  /** What must look right (from BRIEF §6.2). */
  mustLookRight: string;
  seed: number;
  setup: MatchSetup;
  tactics: [TeamTactics, TeamTactics];
  /** Commands issued at tick 0 (placements). */
  script: Command[];
  ticks: number;
}

const place = (playerId: number, x: number, y: number, heading = 0): Command => ({ tick: 0, kind: 'placePlayer', playerId, x, y, heading });
const ballAt = (x: number, y: number, vx = 0, vy = 0): Command => ({ tick: 0, kind: 'placeBall', x, y, z: 0, vx, vy, vz: 0 });
const PI = dmath.PI;

/** Home in a compact defensive block; away in a high press. */
function homeDeepBlock(): Command[] {
  return [
    place(1, -44, 0), place(2, -30, -14), place(3, -32, -5), place(4, -32, 5), place(5, -30, 14),
    place(6, -22, -10), place(7, -24, 0), place(8, -22, 10), place(9, -12, -12), place(10, -10, 0), place(11, -12, 12),
  ];
}
function awayHighPress(): Command[] {
  return [
    place(12, 42, 0, PI), place(13, 12, 12, PI), place(14, 8, 4, PI), place(15, 8, -4, PI), place(16, 12, -12, PI),
    place(17, -8, 10, PI), place(18, -10, 0, PI), place(19, -8, -10, PI), place(20, -22, 12, PI), place(21, -24, 0, PI), place(22, -22, -12, PI),
  ];
}

function base(extra: Partial<MatchSetup> = {}): MatchSetup {
  return { profile: 'mens', surface: 'watered', players: aiSquads(), frameEvery: 0, laws: FIH_OUTDOOR_FAST, firstCentrePass: 0,
    startLive: { quarter: 2, clockTicks: 3000 }, ...extra };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'outlet-under-press', title: 'Outlet from the back under press', seed: 101,
    mustLookRight: 'Goalkeeper and backs building out; the ball going long when the press wins.',
    setup: base(), tactics: [{ ...DEFAULT_TACTICS, buildUp: 'possession' }, { ...DEFAULT_TACTICS, pressHeight: 1 }],
    script: [...homeDeepBlock(), ...awayHighPress(), ballAt(-38, 2)], ticks: 20 * 60,
  },
  {
    id: 'high-press-vs-deep-block', title: 'High press vs deep block', seed: 102,
    mustLookRight: 'Shape holds, gets stretched, recovers — not chaos.',
    setup: base(), tactics: [{ ...DEFAULT_TACTICS, pressHeight: 0.1, defensiveLine: 0.2 }, { ...DEFAULT_TACTICS, pressHeight: 0.95, tempo: 0.7 }],
    script: [...homeDeepBlock(), ...awayHighPress(), ballAt(15, -5)], ticks: 20 * 90,
  },
  {
    id: 'baseline-entry', title: 'Circle entry from the baseline', seed: 103,
    mustLookRight: 'Entry, pull-back to the top of the D, strike.',
    setup: base(), tactics: [{ ...DEFAULT_TACTICS, buildUp: 'wide' }, DEFAULT_TACTICS],
    script: [
      place(11, 40, 14, -0.8), place(10, 33, 3), place(9, 34, -6), place(8, 26, 8), place(7, 24, 0), place(6, 26, -8), place(3, 10, 4), place(4, 10, -4), place(2, 12, 15), place(5, 12, -15), place(1, -44, 0),
      place(12, 44.5, 0, PI), place(14, 40, 4, PI), place(15, 40, -3, PI), place(13, 36, 10, PI), place(16, 36, -9, PI), place(17, 28, 6, PI), place(18, 28, -2, PI), place(19, 27, -9, PI), place(20, 5, 12, PI), place(21, 3, 0, PI), place(22, 5, -12, PI),
      ballAt(40.5, 14.5),
    ], ticks: 20 * 25,
  },
  {
    id: 'two-v-one', title: '2v1 in the circle', seed: 104,
    mustLookRight: 'Overload resolved sensibly — a pass across the keeper or a shot — not dribbling into the defender.',
    setup: base(), tactics: [DEFAULT_TACTICS, DEFAULT_TACTICS],
    script: [
      place(10, 33, -1), place(9, 34, 5), place(12, 44.5, 0, PI), place(14, 37, 1, PI),
      // everyone else far away
      ...[1, 2, 3, 4, 5, 6, 7, 8, 11].map((id, i) => place(id, -5 - i * 2, (i % 2 ? 1 : -1) * (5 + i))),
      ...[13, 15, 16, 17, 18, 19, 20, 21, 22].map((id, i) => place(id, 5 + i * 3, (i % 2 ? 1 : -1) * (6 + i), PI)),
      ballAt(32.5, -1),
    ], ticks: 20 * 12,
  },
  {
    id: 'three-v-two', title: '3v2 in the circle', seed: 105,
    mustLookRight: 'The free player is found; the extra defender cannot cover both.',
    setup: base(), tactics: [DEFAULT_TACTICS, DEFAULT_TACTICS],
    script: [
      place(10, 32, 0), place(9, 34, 7), place(11, 35, -7), place(12, 44.5, 0, PI), place(14, 38, 3, PI), place(15, 38, -3, PI),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((id, i) => place(id, -5 - i * 2, (i % 2 ? 1 : -1) * (5 + i))),
      ...[13, 16, 17, 18, 19, 20, 21, 22].map((id, i) => place(id, 5 + i * 3, (i % 2 ? 1 : -1) * (6 + i), PI)),
      ballAt(31.5, 0),
    ], ticks: 20 * 12,
  },
  ...(['dragFlick', 'lowHit', 'slipRight', 'deflection'] as const).map((variant, k): Scenario => ({
    id: `pc-${variant}`, title: `Penalty corner — ${variant}`, seed: 110 + k,
    mustLookRight: 'Injection, trap, runner race, strike, rebound chain.',
    setup: base(), tactics: [{ ...DEFAULT_TACTICS, pcVariant: variant }, DEFAULT_TACTICS],
    // the umpire awards a PC to home at tick 0 (the AI runs the battery)
    script: [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id, i) => place(id, 20 - i * 3, (i % 2 ? 1 : -1) * (4 + i))),
      ...[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((id, i) => place(id, 30 - i * 3, (i % 2 ? 1 : -1) * (5 + i), PI)),
      { tick: 0, kind: 'award', restart: 'penaltyCorner', team: 0, y: 1 },
    ], ticks: 20 * 30,
  })),
  {
    id: 'pc-one-man-down', title: 'Defending a PC one man down', seed: 120,
    mustLookRight: 'After a green card — the compromise (three runners, or two and a post) must be visible.',
    setup: base({ players: aiSquads().map((p) => (p.id === 16 ? { ...p, onPitch: false } : p)) }),
    tactics: [DEFAULT_TACTICS, DEFAULT_TACTICS],
    script: [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id, i) => place(id, 20 - i * 3, (i % 2 ? 1 : -1) * (4 + i))),
      ...[12, 13, 14, 15, 17, 18, 19, 20, 21, 22].map((id, i) => place(id, 30 - i * 3, (i % 2 ? 1 : -1) * (5 + i), PI)),
      { tick: 0, kind: 'award', restart: 'penaltyCorner', team: 0, y: 1 },
    ], ticks: 20 * 30,
  },
  {
    id: 'last-two-minutes', title: 'Last two minutes, one goal down', seed: 130,
    mustLookRight: 'Goalkeeper off for a kicking back, all-out pressure; the leading team sits and clears.',
    setup: base({
      startLive: { quarter: 4, clockTicks: 15 * 60 * 20 - 2 * 60 * 20, score: [0, 1] },
      // home GK off, kicking back (bench player 23) on
      players: aiSquads().map((p) => (p.id === 1 ? { ...p, onPitch: false } : p.id === 23 ? { ...p, onPitch: true, x: -30, y: 0 } : p)),
    }),
    tactics: [{ ...DEFAULT_TACTICS, press: 'full', mentality: 'attacking', pressHeight: 1, defensiveLine: 1, tempo: 1 }, { ...DEFAULT_TACTICS, press: 'zone', mentality: 'defensive', pressHeight: 0.1, defensiveLine: 0.1, tempo: 0.2 }],
    script: [ballAt(5, 0)], ticks: 20 * 120 + 400, // 2 min of play + stoppages (the clock stops for PCs)
  },
  {
    id: 'counter-attack', title: 'Counter-attack from a turnover', seed: 140,
    mustLookRight: 'Transition speed; the moment of decision — carry into space or release early.',
    setup: base(), tactics: [{ ...DEFAULT_TACTICS, tempo: 0.9, buildUp: 'direct' }, { ...DEFAULT_TACTICS, pressHeight: 0.9 }],
    script: [
      // away committed forward, home wins it on the edge of its own 23
      place(1, -44, 0), place(2, -30, -14), place(3, -26, -3), place(4, -28, 6), place(5, -30, 14), place(6, -18, -8), place(7, -20, 2), place(8, -16, 10), place(9, -2, -14), place(10, 2, 0), place(11, -2, 14),
      place(12, 42, 0, PI), place(13, 20, 14, PI), place(14, 22, 5, PI), place(15, 22, -5, PI), place(16, 20, -14, PI), place(17, -14, 10, PI), place(18, -18, 0, PI), place(19, -14, -10, PI), place(20, -26, 12, PI), place(21, -24, 4, PI), place(22, -26, -12, PI),
      ballAt(-25.5, -3),
    ], ticks: 20 * 25,
  },
  {
    id: 'long-corner', title: 'Long corner', seed: 150,
    mustLookRight: 'Correct restart on the 23 m line, correct shape, ball worked to the top of the D.',
    setup: base(), tactics: [DEFAULT_TACTICS, DEFAULT_TACTICS],
    // the umpire awards a long corner to home on the right
    script: [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id, i) => place(id, 25 - i * 3, (i % 2 ? 1 : -1) * (3 + i))),
      ...[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((id, i) => place(id, 30 - i * 3, (i % 2 ? 1 : -1) * (5 + i), PI)),
      { tick: 0, kind: 'award', restart: 'longCorner', team: 0, y: 12 },
    ], ticks: 20 * 25,
  },
];

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.id === id);

/** Run a scenario with the AI controller: the placement script fires on tick 0, then the AI plays. */
export function runScenario(sc: Scenario): MatchLog {
  const ai = aiController(sc.seed, squadsFromSetup(sc.setup.players, sc.tactics), { profile: getProfile(sc.setup.profile), surface: sc.setup.surface });
  const controller: Controller = (view, rules, tick) => (tick === 0 ? [...sc.script, ...ai(view, rules, tick)] : ai(view, rules, tick));
  return simulateMatch(sc.setup, sc.seed, controller, sc.ticks);
}

// referenced constants kept for scenario authors' convenience
export const SCENARIO_LANDMARKS = { CIRCLE_TOP_X, HALF_LENGTH, LINE_23_X, PENALTY_SPOT_X } as const;
