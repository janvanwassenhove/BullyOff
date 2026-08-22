/**
 * Rules suite — Phase 2 gate: every rule has ≥1 positive and ≥1 negative case.
 * Coordinates: home (team 0) attacks +x (east goal at x=+45.7); away attacks −x.
 */
import { describe, expect, it } from 'vitest';
import { HALF_LENGTH, HALF_WIDTH, LINE_23_X, inCircle } from '@bullyoff/shared';
import { gateCommand } from './rules.js';
import { Harness, TEST_LAWS, fakeTeams } from './testkit.js';
import type { TickSignals } from './types.js';

const struck = (playerId: number, team: 0 | 1, at: { x: number; y: number }, extra: Partial<TickSignals['struck'][number]> = {}): TickSignals['struck'][number] =>
  ({ playerId, team, kind: 'push', face: 'flat', speed: 10, lift: 0, at, ...extra });

function live(): Harness {
  const h = new Harness(fakeTeams());
  h.goLive(10, 0);
  return h;
}

describe('quarters and clock', () => {
  it('starts Q1 with a centre pass by the first team; the clock runs only after the pass is taken and while the ball is live', () => {
    const h = new Harness(fakeTeams());
    h.step();
    expect(h.last('quarterStart')?.quarter).toBe(1);
    expect(h.last('restart')?.restart.kind).toBe('centrePass');
    expect(h.s.ballDead).toBe(true);
    h.run(TEST_LAWS.setupTicks.centrePass + 1);
    expect(h.s.ballDead).toBe(false);
    expect(h.s.clockRunning).toBe(false); // ready, but not taken → clock still stopped
    h.step({ struck: [struck(10, 0, { x: 0, y: 0 })] });
    expect(h.s.clockRunning).toBe(true);
    const c0 = h.s.clockTicks; h.run(10);
    expect(h.s.clockTicks).toBe(c0 + 10);
  });

  it('negative: the clock does not advance while the ball is dead', () => {
    const h = live();
    h.step({ sidelineCrossings: [{ side: 1, x: 3 }] }); // dead ball
    const c0 = h.s.clockTicks; h.run(1); expect(h.s.clockTicks).toBe(c0);
  });

  it('runs four quarters with alternating centre passes, breaks between, then full time; PC in progress delays the quarter end', () => {
    const h = live();
    h.run(TEST_LAWS.quarterTicks + 2);
    expect(h.last('quarterEnd')?.quarter).toBe(1);
    expect(h.s.phase).toBe('break');
    h.run(TEST_LAWS.breakTicks[0] + 1);
    expect(h.last('quarterStart')?.quarter).toBe(2);
    expect(h.last('quarterStart')?.centrePassTeam).toBe(1); // alternates
    // take Q2 centre pass and run to its end
    h.takeRestart(21, 1);
    h.run(TEST_LAWS.quarterTicks - 3);
    // award a PC just before time: quarter must not end until it's over
    h.ball = { x: -38, y: 6, z: 0 }; // heading wide, not goal-bound → PC (not a stroke)
    h.step({ bodyContacts: [{ playerId: 3, team: 0, at: { x: -40, y: 5, z: 0 }, ballSpeed: 5, ballHeight: 0 }] }); // home defender feet in own circle → PC to away
    expect(h.s.pcActive).toBe(true);
    h.run(10);
    expect(h.s.phase).toBe('inPlay');
    expect(h.last('quarterEnd')?.quarter).toBe(1);
    // take the PC and clear it → then the quarter ends
    h.takeRestart(21, 1);
    h.ball = { x: -20, y: 0, z: 0 };
    h.step({ circleExits: [{ end: -1 }] });
    h.run(2);
    expect(h.last('quarterEnd')?.quarter).toBe(2);
    // Q3, Q4 → full time
    h.run(TEST_LAWS.breakTicks[1] + 1); h.takeRestart(10, 0); h.run(TEST_LAWS.quarterTicks + 2);
    h.run(TEST_LAWS.breakTicks[2] + 1); h.takeRestart(21, 1); h.run(TEST_LAWS.quarterTicks + 2);
    expect(h.s.phase).toBe('fullTime');
    expect(h.last('fullTime')).toBeDefined();
  });
});

describe('the circle rule (goal scoring)', () => {
  it('positive: attacker plays the ball inside the circle, it crosses inside the goal → goal, centre pass to the conceding team', () => {
    const h = live();
    h.ball = { x: 40, y: 0, z: 0 };
    h.step({ struck: [struck(10, 0, { x: 40, y: 0 }, { kind: 'hit', speed: 25 })] });
    h.ball = { x: 45.8, y: 0.2, z: 0.1 };
    const out = h.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: 0.2, z: 0.1 }], circleExits: [{ end: 1 }] });
    const goal = out.find((r) => r.kind === 'goal');
    expect(goal?.kind === 'goal' && goal.team).toBe(0);
    expect(h.s.score).toEqual([1, 0]);
    expect(h.last('restart')?.restart.kind).toBe('centrePass');
    expect(h.last('restart')?.restart.team).toBe(1);
    expect(h.s.clockRunning).toBe(false); // FIH: time stopped after a goal
  });

  it('negative: attacker strikes from OUTSIDE the circle straight in → no goal, 15 m hit-out to the defence', () => {
    const h = live();
    h.ball = { x: 28, y: 0, z: 0 };
    h.step({ struck: [struck(10, 0, { x: 28, y: 0 }, { kind: 'hit', speed: 30 })] });
    h.step({ circleEntries: [{ end: 1 }] });
    const out = h.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: 0, z: 0.1 }], circleExits: [{ end: 1 }] });
    expect(out.some((r) => r.kind === 'goal')).toBe(false);
    expect(h.s.score).toEqual([0, 0]);
    expect(h.last('restart')?.restart.kind).toBe('hitOut');
    expect(h.last('restart')?.restart.team).toBe(1);
    expect(h.last('restart')?.restart.at.x).toBeCloseTo(HALF_LENGTH - 15, 6);
  });

  it('a defender\'s deflection after an attacker\'s in-circle touch still counts as a goal; a defender putting it in without any attacker touch does not', () => {
    const h = live();
    h.ball = { x: 38, y: 1, z: 0 };
    h.step({ struck: [struck(10, 0, { x: 38, y: 1 })] });
    h.step({ bodyContacts: [{ playerId: 12, team: 1, at: { x: 44, y: 1, z: 0 }, ballSpeed: 4, ballHeight: 0 }] }); // GK in own circle: legal
    const out = h.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: 1, z: 0 }], circleExits: [{ end: 1 }] });
    expect(out.some((r) => r.kind === 'goal')).toBe(true);
    // credited to the attacker who played it, not left anonymous because the keeper got the last touch
    const goal = out.find((r) => r.kind === 'goal');
    expect(goal?.kind === 'goal' ? goal.scorerId : null).toBe(10);

    const g = live();
    g.ball = { x: 42, y: 0, z: 0 };
    g.step({ struck: [struck(14, 1, { x: 42, y: 0 })] }); // away defender plays it inside own circle
    const o2 = g.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: 0, z: 0 }], circleExits: [{ end: 1 }] });
    expect(o2.some((r) => r.kind === 'goal')).toBe(false);
    expect(g.last('restart')?.restart.kind).toBe('longCorner'); // off the defender over own backline
  });
});

describe('ball out of play', () => {
  it('sideline: free hit to the team that did not touch it last, on the sideline; negative: no crossing → play on', () => {
    const h = live();
    h.step({ struck: [struck(10, 0, { x: 5, y: 20 })] });
    const n = h.log.length;
    h.step();
    expect(h.log.slice(n).some((r) => r.kind === 'restart')).toBe(false);
    h.step({ sidelineCrossings: [{ side: 1, x: 7 }] });
    const r = h.last('restart')?.restart;
    expect(r?.kind).toBe('freeHit');
    expect(r?.team).toBe(1);
    expect(r?.at.y).toBeCloseTo(HALF_WIDTH - 0.3, 6);
    expect(r?.at.x).toBeCloseTo(7, 6);
  });

  it('backline off an attacker → 15 m hit-out; off a defender\'s body → long corner on the 23 m; defender\'s own stick from inside their circle → penalty corner', () => {
    const h = live();
    h.ball = { x: 40, y: 8, z: 0 };
    h.step({ struck: [struck(10, 0, { x: 40, y: 8 })] });
    h.step({ goalLineCrossings: [{ end: 1, inGoal: false, y: 9, z: 0 }] });
    expect(h.last('restart')?.restart.kind).toBe('hitOut');
    expect(h.last('restart')?.restart.team).toBe(1);

    const g = live();
    g.ball = { x: 30, y: 8, z: 0 };
    g.step({ struck: [struck(10, 0, { x: 30, y: 8 })] });
    g.step({ bodyContacts: [{ playerId: 12, team: 1, at: { x: 44, y: 9, z: 0 }, ballSpeed: 3, ballHeight: 0 }] }); // GK deflects it, legal
    g.step({ goalLineCrossings: [{ end: 1, inGoal: false, y: 10, z: 0 }] });
    expect(g.last('restart')?.restart.kind).toBe('longCorner');
    expect(g.last('restart')?.restart.at.x).toBeCloseTo(LINE_23_X, 6);

    const k = live();
    k.ball = { x: 43, y: 3, z: 0 };
    k.step({ struck: [struck(14, 1, { x: 43, y: 3 })] }); // away defender clears from inside own circle...
    k.step({ goalLineCrossings: [{ end: 1, inGoal: false, y: 6, z: 0 }] }); // ...over their own backline
    expect(k.last('restart')?.restart.kind).toBe('penaltyCorner');
    expect(k.last('penaltyCornerAwarded')?.team).toBe(0);
  });
});

describe('fouls from physics', () => {
  it('feet: an outfield player\'s body contact is an offence → free hit; in their own circle → penalty corner; negative: goalkeeper in own circle is legal', () => {
    const h = live();
    h.step({ bodyContacts: [{ playerId: 6, team: 0, at: { x: 0, y: 0, z: 0 }, ballSpeed: 5, ballHeight: 0 }] });
    expect(h.last('foul')?.foul).toBe('feet');
    expect(h.last('restart')?.restart.kind).toBe('freeHit');
    expect(h.last('restart')?.restart.team).toBe(1);

    const g = live();
    g.step({ bodyContacts: [{ playerId: 3, team: 0, at: { x: -40, y: 2, z: 0 }, ballSpeed: 5, ballHeight: 0 }] });
    expect(g.last('foul')?.awards).toBe('penaltyCorner');
    expect(g.s.pcActive).toBe(true);

    const k = live();
    const n = k.log.length;
    k.step({ bodyContacts: [{ playerId: 1, team: 0, at: { x: -44, y: 0, z: 0 }, ballSpeed: 5, ballHeight: 0 }] });
    expect(k.log.slice(n).some((r) => r.kind === 'foul')).toBe(false);
  });

  it('penalty stroke: a defender\'s body stops a goal-bound ball in their own circle (+ yellow card); negative: not goal-bound → just a PC', () => {
    const h = live();
    h.ball = { x: -35, y: 0.5, z: 0 };
    h.step({ struck: [struck(21, 1, { x: -35, y: 0.5 }, { kind: 'hit', speed: 25 })] });
    h.ball = { x: -38, y: 0.4, z: 0 };
    h.step({ bodyContacts: [{ playerId: 3, team: 0, at: { x: -41, y: 0.3, z: 0.1 }, ballSpeed: 20, ballHeight: 0.1 }] });
    expect(h.last('foul')?.awards).toBe('penaltyStroke');
    expect(h.last('card')?.colour).toBe('yellow');
    expect(h.s.psActive).toBe(true);

    const g = live();
    g.ball = { x: -35, y: 10, z: 0 };
    g.step({ struck: [struck(21, 1, { x: -35, y: 10 })] });
    g.ball = { x: -38, y: 10, z: 0 };
    g.step({ bodyContacts: [{ playerId: 3, team: 0, at: { x: -41, y: 10, z: 0 }, ballSpeed: 8, ballHeight: 0 }] }); // heading wide
    expect(g.last('foul')?.awards).toBe('penaltyCorner');
  });

  it('dangerous play: a raised ball at an opponent within 5 m above knee height → foul + green card; negative: nobody in the line of fire', () => {
    const h = live();
    h.players.find((p) => p.id === 20)!.x = 3; h.players.find((p) => p.id === 20)!.y = 0.2; // opponent 3 m in front of the striker at (0,0)
    h.ball = { x: 0, y: 0, z: 0.01 }; h.vel = { x: 12, y: 0, z: 6 };
    h.step({ struck: [struck(10, 0, { x: 0, y: 0 }, { kind: 'aerial', lift: 0.5, speed: 14 })] });
    expect(h.last('foul')?.foul).toBe('dangerous');
    expect(h.last('card')?.colour).toBe('green');
    expect(h.last('restart')?.restart.team).toBe(1);

    const g = live();
    g.ball = { x: -20, y: -20, z: 0.01 }; g.vel = { x: 12, y: 0, z: 6 }; // nobody within 5 m downrange
    const n = g.log.length;
    g.step({ struck: [struck(6, 0, { x: -20, y: -20 }, { kind: 'aerial', lift: 0.5, speed: 14 })] });
    expect(g.log.slice(n).some((r) => r.kind === 'foul')).toBe(false);
  });

  it('negative: a raised shot at the goalkeeper is not dangerous play (keepers are protected)', () => {
    const g = live();
    g.players.find((p) => p.id === 12)!.x = 44; g.players.find((p) => p.id === 12)!.y = 0.1; // away GK
    g.ball = { x: 40, y: 0, z: 0.01 }; g.vel = { x: 20, y: 0, z: 5 };
    const n = g.log.length;
    g.step({ struck: [struck(10, 0, { x: 40, y: 0 }, { kind: 'flick', lift: 0.25, speed: 22 })] });
    expect(g.log.slice(n).some((r) => r.kind === 'foul')).toBe(false);
  });

  it('back-stick: playing with the round side → foul; flat side → play on', () => {
    const h = live();
    h.step({ struck: [struck(10, 0, { x: 5, y: 5 }, { face: 'round' })] });
    expect(h.last('foul')?.foul).toBe('backStick');
    const g = live();
    const n = g.log.length;
    g.step({ struck: [struck(10, 0, { x: 5, y: 5 }, { face: 'flat' })] });
    expect(g.log.slice(n).some((r) => r.kind === 'foul')).toBe(false);
  });

  it('a defender\'s dangerous ball inside their own 23 m → penalty corner (not just a free hit)', () => {
    const h = live();
    h.players.find((p) => p.id === 20)!.x = -30; h.players.find((p) => p.id === 20)!.y = 0.1;
    h.ball = { x: -33, y: 0, z: 0.01 }; h.vel = { x: 12, y: 0, z: 6 };
    h.step({ struck: [struck(3, 0, { x: -33, y: 0 }, { kind: 'aerial', lift: 0.5, speed: 14 })] });
    expect(h.last('foul')?.awards).toBe('penaltyCorner');
  });
});

describe('free hits', () => {
  it('opponents within 5 m are moved away at the restart; the taker may self-pass (play it again) without offence', () => {
    const h = live();
    h.players.find((p) => p.id === 20)!.x = 6; h.players.find((p) => p.id === 20)!.y = 24; // will be within 5 m of the side-in spot
    h.step({ struck: [struck(20, 1, { x: 6, y: 24 })] });
    h.step({ sidelineCrossings: [{ side: 1, x: 6 }] }); // free hit to home at (6, 27.2)
    const pl = h.last('placePlayers');
    const moved = pl?.placements.find((p) => p.playerId === 20);
    expect(moved).toBeDefined();
    const dx = (moved?.x ?? 0) - 6, dy = (moved?.y ?? 0) - (HALF_WIDTH - 0.3);
    expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(5);
    // taker plays it, then plays it again (self-pass): legal
    h.takeRestart(9, 0);
    const n = h.log.length;
    h.step({ struck: [struck(9, 0, { x: 7, y: 26 })] });
    expect(h.log.slice(n).some((r) => r.kind === 'foul')).toBe(false);
    expect(h.s.clockRunning).toBe(true);
  });

  it('negative: while a restart is pending, the other team may not play the ball (gate) and nobody may while it is dead', () => {
    const h = live();
    h.step({ sidelineCrossings: [{ side: 1, x: 6 }] }); // free hit to away
    expect(gateCommand(h.s, h.view(), 'strike', 10, h.laws)).toBe(false); // dead
    h.run(h.s.waitTicks + 1);
    expect(gateCommand(h.s, h.view(), 'strike', 10, h.laws)).toBe(false); // wrong team
    expect(gateCommand(h.s, h.view(), 'strike', 20, h.laws)).toBe(true);
  });

  it('attacking free hit inside the 23 m: ball into the circle before 5 m without another touch → free hit to the defence; negative: after 5 m it is fine', () => {
    const h = live();
    h.ball = { x: 30, y: 12, z: 0 };
    h.step({ struck: [struck(14, 1, { x: 30, y: 12 })] });
    h.step({ sidelineCrossings: [{ side: 1, x: 30 }] }); // free hit to home at (30, 27.2) — inside attacking 23 m
    h.takeRestart(9, 0);
    h.ball = { x: 31, y: 24, z: 0 }; // only ~3 m later
    h.step({ circleEntries: [{ end: 1 }] });
    expect(h.last('foul')?.foul).toBe('freeHit23Circle');

    const g = live();
    g.ball = { x: 30, y: 12, z: 0 };
    g.step({ struck: [struck(14, 1, { x: 30, y: 12 })] });
    g.step({ sidelineCrossings: [{ side: 1, x: 30 }] });
    g.takeRestart(9, 0);
    g.ball = { x: 33, y: 20, z: 0 }; // > 5 m travelled
    const n = g.log.length;
    g.step({ circleEntries: [{ end: 1 }] });
    expect(g.log.slice(n).some((r) => r.kind === 'foul')).toBe(false);
  });
});

describe('penalty corner', () => {
  function pcAwarded(): Harness {
    const h = live();
    h.step({ bodyContacts: [{ playerId: 15, team: 1, at: { x: 40, y: 3, z: 0 }, ballSpeed: 5, ballHeight: 0 }] }); // away feet in own circle → PC to home
    return h;
  }
  it('award: ball on the backline 10 m from the post; ≤5 defenders behind the line, others beyond halfway, attackers outside the circle; clock stopped', () => {
    const h = pcAwarded();
    expect(h.s.pcActive).toBe(true);
    const r = h.last('restart')?.restart;
    expect(r?.kind).toBe('penaltyCorner');
    expect(r?.at.x).toBeCloseTo(HALF_LENGTH, 6);
    expect(Math.abs(r?.at.y ?? 0)).toBeCloseTo(1.83 + 10, 6);
    expect(h.s.clockRunning).toBe(false);
    const behind = h.players.filter((p) => p.team === 1 && p.x >= HALF_LENGTH - 0.5);
    expect(behind.length).toBeLessThanOrEqual(5);
    const beyond = h.players.filter((p) => p.team === 1 && p.x <= 0);
    expect(behind.length + beyond.length).toBe(11);
    const injectorId = h.last('placePlayers')?.placements[0]?.playerId;
    const attackersInCircle = h.players.filter((p) => p.team === 0 && p.id !== injectorId && inCircle({ x: p.x, y: p.y }, 1));
    expect(attackersInCircle.length).toBe(0);
    // and every other attacker is within a few metres of the D — the set-up walk is compressed into the placement
    for (const p of h.players.filter((q) => q.team === 0 && q.id !== injectorId)) expect(HALF_LENGTH - p.x).toBeLessThan(19);
  });
  it('taken → clock resumes; a first *hit* shot above 460 mm → no goal, foul; a drag flick at any height can score (fromPC)', () => {
    const h = pcAwarded();
    h.takeRestart(9, 0);
    expect(h.s.clockRunning).toBe(true);
    expect(h.last('penaltyCornerTaken')).toBeDefined();
    h.ball = { x: 32, y: 0, z: 0 };
    h.step({ struck: [struck(10, 0, { x: 32, y: 0 }, { kind: 'hit', speed: 30, lift: 0.1 })] });
    const out = h.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: 0, z: 0.9 }], circleExits: [{ end: 1 }] });
    expect(out.some((r) => r.kind === 'goal')).toBe(false);
    expect(h.last('foul')?.foul).toBe('pcHighFirstHit');
    expect(h.last('penaltyCornerEnded')?.outcome).toBe('foul');

    const g = pcAwarded();
    g.takeRestart(9, 0);
    g.ball = { x: 32, y: 0, z: 0 };
    g.step({ struck: [struck(10, 0, { x: 32, y: 0 }, { kind: 'flick', speed: 28, lift: 0.2 })] });
    const o2 = g.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: 0, z: 1.5 }], circleExits: [{ end: 1 }] });
    const goal = o2.find((r) => r.kind === 'goal');
    expect(goal?.kind === 'goal' && goal.fromPC).toBe(true);
    expect(g.last('penaltyCornerEnded')?.outcome).toBe('goal');
  });
  it('a low first hit is a goal; the PC ends when the ball is cleared well out of the circle', () => {
    const h = pcAwarded();
    h.takeRestart(9, 0);
    h.ball = { x: 32, y: 0, z: 0 };
    h.step({ struck: [struck(10, 0, { x: 32, y: 0 }, { kind: 'hit', speed: 30 })] });
    const out = h.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: 0, z: 0.2 }], circleExits: [{ end: 1 }] });
    expect(out.some((r) => r.kind === 'goal')).toBe(true);

    const g = pcAwarded();
    g.takeRestart(9, 0);
    g.ball = { x: 20, y: 0, z: 0 };
    g.step({ circleExits: [{ end: 1 }] });
    expect(g.last('penaltyCornerEnded')?.outcome).toBe('cleared');
    expect(g.s.pcActive).toBe(false);
  });
  it('a PC ball that crosses the goal line without an attacker touch in the circle (defender last) ends the PC and gives a long corner — never a stalled PC', () => {
    const h = pcAwarded();
    h.takeRestart(9, 0);
    // trapped outside the D by an attacker, flicked from outside the circle, deflected in by a defender: circle rule says no goal
    h.ball = { x: 30, y: 0, z: 0 };
    h.step({ trapped: [{ playerId: 6, team: 0, at: { x: 30, y: 0 }, clean: false }], circleExits: [{ end: 1 }] });
    expect(h.s.pcActive).toBe(true); // still within 5 m of the D: the corner is live
    h.step({ struck: [struck(10, 0, { x: 30, y: 0 }, { kind: 'flick', speed: 28, lift: 0.2 })], circleEntries: [{ end: 1 }] });
    h.ball = { x: 44, y: 0, z: 0.5 };
    h.step({ trapped: [{ playerId: 12, team: 1, at: { x: 44, y: 0 }, clean: false }] });
    const out = h.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: -0.7, z: 0.7 }], circleExits: [{ end: 1 }] });
    expect(out.some((r) => r.kind === 'goal')).toBe(false);
    expect(h.last('penaltyCornerEnded')?.outcome).toBe('out');
    expect(h.s.pcActive).toBe(false);
    expect(h.last('restart')?.restart.kind).toBe('longCorner');
  });
  it('a restart nobody takes is reversed to the other team after the timeout (FIH 12.1 delaying; stall safeguard)', () => {
    const h = pcAwarded();
    const before = h.last('restart')?.restart;
    expect(before?.kind).toBe('penaltyCorner'); expect(before?.team).toBe(0);
    h.run(TEST_LAWS.setupTicks.penaltyCorner + TEST_LAWS.restartTimeoutTicks + 2);
    const rev = h.last('restartReversed');
    expect(rev?.kind === 'restartReversed' && rev.to).toBe(1);
    expect(h.s.pcActive).toBe(false);
    expect(h.last('restart')?.restart.team).toBe(1);
    expect(h.last('restart')?.restart.kind).toBe('freeHit');
  });
  it('substitutions are blocked during a PC (except the goalkeeper); allowed in open play', () => {
    const h = pcAwarded();
    expect(gateCommand(h.s, h.view(), 'substitute', 5, h.laws)).toBe(false);
    expect(gateCommand(h.s, h.view(), 'substitute', 12, h.laws)).toBe(true); // GK
    const g = live();
    expect(gateCommand(g.s, g.view(), 'substitute', 5, g.laws)).toBe(true);
  });
});

describe('penalty stroke', () => {
  function psAwarded(): Harness {
    const h = live();
    h.ball = { x: 35, y: 0, z: 0 };
    h.step({ struck: [struck(10, 0, { x: 35, y: 0 }, { kind: 'hit', speed: 25 })] });
    h.ball = { x: 38, y: 0, z: 0 };
    h.step({ bodyContacts: [{ playerId: 15, team: 1, at: { x: 41, y: 0, z: 0.1 }, ballSpeed: 20, ballHeight: 0.1 }] });
    return h;
  }
  it('award: ball on the spot, GK on the line, everyone else beyond the 23 m; only the taker may strike; goal is fromPS', () => {
    const h = psAwarded();
    expect(h.s.psActive).toBe(true);
    const r = h.last('restart')?.restart;
    expect(r?.kind).toBe('penaltyStroke');
    expect(r?.at.x).toBeCloseTo(HALF_LENGTH - 6.4, 6);
    const others = h.players.filter((p) => p.id !== 12 && p.x > LINE_23_X - 0.5);
    expect(others.length).toBe(1); // only the taker
    h.run(h.s.waitTicks + 1);
    const taker = others[0]!;
    expect(gateCommand(h.s, h.view(), 'strike', 20, h.laws)).toBe(false);
    expect(gateCommand(h.s, h.view(), 'trap', taker.id, h.laws)).toBe(false); // must be a strike
    expect(gateCommand(h.s, h.view(), 'strike', taker.id, h.laws)).toBe(true);
    h.step({ struck: [struck(taker.id, 0, { x: HALF_LENGTH - 6.4, y: 0 }, { kind: 'flick', speed: 20, lift: 0.2 })] });
    const out = h.step({ goalLineCrossings: [{ end: 1, inGoal: true, y: 0.5, z: 0.8 }] });
    const goal = out.find((r) => r.kind === 'goal');
    expect(goal?.kind === 'goal' && goal.fromPS).toBe(true);
    expect(h.last('penaltyStrokeTaken')?.scored).toBe(true);
  });
  it('negative: a stroke that misses over the backline → no goal, defence hit-out; the stroke is over', () => {
    const h = psAwarded();
    h.run(h.s.waitTicks + 1);
    const taker = h.players.find((p) => p.team === 0 && p.x > LINE_23_X)!;
    h.step({ struck: [struck(taker.id, 0, { x: HALF_LENGTH - 6.4, y: 0 }, { kind: 'flick', speed: 20, lift: 0.5 })] });
    const out = h.step({ goalLineCrossings: [{ end: 1, inGoal: false, y: 0.5, z: 2.5 }] });
    expect(out.some((r) => r.kind === 'goal')).toBe(false);
    expect(h.s.psActive).toBe(false);
    expect(h.last('restart')?.restart.kind).toBe('hitOut');
  });
});

describe('cards and suspensions', () => {
  it('persistent fouling: 3rd personal foul → green (2 min), 5th → yellow; the player is off, and comes back when the playing clock has run', () => {
    const h = live();
    const foulOnce = (): void => {
      h.step({ struck: [struck(6, 0, { x: 2, y: 2 }, { face: 'round' })] }); // back-stick by player 6
      h.takeRestart(20, 1);
    };
    foulOnce(); foulOnce();
    expect(h.has('card')).toBe(false);
    foulOnce();
    expect(h.last('card')?.colour).toBe('green');
    expect(h.last('card')?.playerId).toBe(6);
    expect(h.players.find((p) => p.id === 6)?.onPitch).toBe(false);
    expect(gateCommand(h.s, h.view(), 'strike', 6, h.laws)).toBe(false);
    // clock must run for the suspension to be served: play on for its duration
    h.run(TEST_LAWS.cards.green + 2);
    expect(h.players.find((p) => p.id === 6)?.onPitch).toBe(true);
    expect(h.last('reinstate')?.playerId).toBe(6);
    foulOnce(); foulOnce();
    expect(h.last('card')?.colour).toBe('yellow');
    expect(h.last('card')?.suspensionTicks).toBe(TEST_LAWS.cards.yellow);
  });
  it('negative: suspension time does not run while the clock is stopped (e.g. a PC being set up); it does run through an ordinary free hit', () => {
    const h = live();
    for (let i = 0; i < 3; i++) { h.step({ struck: [struck(6, 0, { x: 2, y: 2 }, { face: 'round' })] }); h.takeRestart(20, 1); }
    expect(h.players.find((p) => p.id === 6)?.onPitch).toBe(false);
    h.step({ bodyContacts: [{ playerId: 3, team: 0, at: { x: -40, y: 0, z: 0 }, ballSpeed: 5, ballHeight: 0 }] }); // PC → clock stopped
    expect(h.s.clockRunning).toBe(false);
    h.run(TEST_LAWS.cards.green + 5); // PC never taken: playing time does not advance
    expect(h.players.find((p) => p.id === 6)?.onPitch).toBe(false);
    const g = live();
    for (let i = 0; i < 3; i++) { g.step({ struck: [struck(6, 0, { x: 2, y: 2 }, { face: 'round' })] }); g.takeRestart(20, 1); }
    g.step({ sidelineCrossings: [{ side: 1, x: 5 }] }); // free hit pending: FIH — time runs
    g.run(TEST_LAWS.cards.green + 5);
    expect(g.players.find((p) => p.id === 6)?.onPitch).toBe(true);
  });
});
