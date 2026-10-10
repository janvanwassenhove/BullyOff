/**
 * The penalty-corner counter matrix (docs/design/hockey-systems.md §5, acceptance table §8). The
 * four running-out systems are data in PC_DEFENCES; what has to be true is that each has a hole and
 * none dominates — otherwise the coach's choice is solved, not a decision. Everything here is
 * relational over batches of corners (the magnitudes belong to calibration):
 *
 *   · two bodies committed low are two bodies not in the goal — the straight flick beats a doubleCharge
 *     more often than it beats the single flyer
 *   · two low runners smother the low hit — it beats the single high flyer more often than a doubleCharge
 *   · the flyer's height is a real bet: set low he is flicked over, set high the low hit goes under him
 *   · the lift beats the keeper who has left his line, the ball along the turf does not
 *   · no system is the best answer to every variant
 *   · a system needs its players: the AI's default per club follows the squad (pcDefenceFor)
 *   · the castle is legal: nobody crosses the backline before the injection
 *
 * Each corner is its own short match from an awarded PC (the scenario deck does the same), so a
 * batch is dozens of independent corners rather than one long game.
 */
import { describe, expect, it } from 'vitest';
import { HALF_LENGTH, dmath } from '@bullyoff/shared';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { simulateMatch, type Controller, type MatchSetup } from '../match/match.js';
import { aiController, squadsFromSetup } from './brain.js';
import { DEFAULT_TACTICS, PC_DEFENCES, pcDefenceFor, type PcDefenceId, type PcVariant, type RunnerProfile, type TeamTactics } from './tactics.js';
import { aiSquads } from '../sim/fixtures.js';
import { MENS } from '../profile.js';
import { FRAME_PLAYER_STRIDE, type MatchLog } from '../events/events.js';
import type { Command } from '../match/commands.js';
import type { PlayerSetup } from '../match/match.js';

const PI = dmath.PI;
const place = (playerId: number, x: number, y: number, heading = 0): Command => ({ tick: 0, kind: 'placePlayer', playerId, x, y, heading });

interface CornerOpts { runner?: RunnerProfile; players?: PlayerSetup[]; frames?: boolean }

/** One corner: home (team 0) attacks with `variant`, away defends with `defence`. */
function corner(seed: number, variant: PcVariant, defence: PcDefenceId, opts: CornerOpts = {}): MatchLog {
  const setup: MatchSetup = { profile: 'mens', surface: 'watered', players: opts.players ?? aiSquads(), frameEvery: opts.frames ? 1 : 0, laws: FIH_OUTDOOR_FAST, firstCentrePass: 0, startLive: { quarter: 2, clockTicks: 3000 } };
  const def: TeamTactics = { ...DEFAULT_TACTICS, pcDefence: defence, ...(opts.runner ? { pcRunnerProfile: opts.runner } : {}) };
  const tactics: [TeamTactics, TeamTactics] = [{ ...DEFAULT_TACTICS, pcVariant: variant }, def];
  const script: Command[] = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id, i) => place(id, 20 - i * 3, (i % 2 ? 1 : -1) * (4 + i))),
    ...[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((id, i) => place(id, 30 - i * 3, (i % 2 ? 1 : -1) * (5 + i), PI)),
    // alternate the side the corner is taken from, as a season would
    { tick: 0, kind: 'award', restart: 'penaltyCorner', team: 0, y: seed % 2 ? 1 : -1 },
  ];
  const ai = aiController(seed, squadsFromSetup(setup.players, tactics), { profile: MENS, surface: 'watered' });
  const controller: Controller = (view, rules, tick) => (tick === 0 ? [...script, ...ai(view, rules, tick)] : ai(view, rules, tick));
  return simulateMatch(setup, seed, controller, 20 * 25);
}

/**
 * Share of corner sequences that end in a goal. A corner re-awarded off a defender's foot is the
 * same sequence to a coach ("we scored from the corner"), so the window covers the re-awards too:
 * counting only the first award would score a castle that gets hit on the shin as a defence.
 */
function conversion(variant: PcVariant, defence: PcDefenceId, n: number, opts: CornerOpts = {}): number {
  let goals = 0;
  for (let i = 0; i < n; i++) {
    const log = corner(5000 + i, variant, defence, opts);
    if (log.events.some((e) => e.t === 'Goal' && e.team === 0 && e.fromPC)) goals++;
  }
  return goals / n;
}

const N = 40;
const pct = (v: number): string => `${Math.round(100 * v)} %`;

describe('penalty-corner defence systems (§5)', () => {
  it('all four systems exist as data and differ in who leads', () => {
    const leads = new Set(Object.values(PC_DEFENCES).map((s) => s.lead));
    expect(leads.size).toBe(4);
    expect(PC_DEFENCES.block.chargeCommit).toBe(0);
    expect(PC_DEFENCES.keeperLeads.gkSet).toBe('advanced');
  });

  it('the straight flick beats two bodies committed low more often than the single flyer', () => {
    const vsDouble = conversion('dragFlick', 'doubleCharge', N);
    const vsRunner = conversion('dragFlick', 'runnerLeads', N);
    console.warn(`dragFlick: vs doubleCharge ${pct(vsDouble)} · vs runnerLeads ${pct(vsRunner)}`);
    expect(vsDouble).toBeGreaterThan(vsRunner);
  }, 240_000);

  it('two low runners smother the low hit that goes under a single high flyer', () => {
    const vsRunner = conversion('lowHit', 'runnerLeads', N);
    const vsDouble = conversion('lowHit', 'doubleCharge', N);
    console.warn(`lowHit: vs runnerLeads ${pct(vsRunner)} · vs doubleCharge ${pct(vsDouble)}`);
    expect(vsRunner).toBeGreaterThan(vsDouble);
  }, 240_000);

  it("the flyer's height is a bet: low is flicked over, high is hit under", () => {
    const flickLow = conversion('dragFlick', 'runnerLeads', N, { runner: 'low' });
    const flickHigh = conversion('dragFlick', 'runnerLeads', N, { runner: 'high' });
    const hitLow = conversion('lowHit', 'runnerLeads', N, { runner: 'low' });
    const hitHigh = conversion('lowHit', 'runnerLeads', N, { runner: 'high' });
    console.warn(`runner low: flick ${pct(flickLow)} hit ${pct(hitLow)} · runner high: flick ${pct(flickHigh)} hit ${pct(hitHigh)}`);
    expect(flickLow).toBeGreaterThan(flickHigh);
    expect(hitHigh).toBeGreaterThan(hitLow);
  }, 480_000);

  it('the lift beats the keeper who has left his line; the ball along the turf does not', () => {
    const flick = conversion('dragFlick', 'keeperLeads', N);
    const hit = conversion('lowHit', 'keeperLeads', N);
    console.warn(`keeperLeads: flick ${pct(flick)} · lowHit ${pct(hit)}`);
    expect(flick).toBeGreaterThan(hit);
  }, 240_000);

  it('no system dominates: each is beaten on at least one variant by another system', () => {
    const systems = Object.keys(PC_DEFENCES) as PcDefenceId[];
    const variants: PcVariant[] = ['dragFlick', 'lowHit', 'slipLeft', 'deflection'];
    const grid = new Map<string, number>();
    for (const v of variants) for (const s of systems) grid.set(`${v}/${s}`, conversion(v, s, 24));
    console.warn([...grid.entries()].map(([k, c]) => `${k} ${pct(c)}`).join(' · '));
    for (const s of systems) {
      // a dominant system would concede the least on every variant
      const beatenSomewhere = variants.some((v) => systems.some((o) => o !== s && (grid.get(`${v}/${o}`) ?? 0) < (grid.get(`${v}/${s}`) ?? 0)));
      expect(beatenSomewhere, `${s} is not the best answer to everything`).toBe(true);
    }
  }, 600_000);

  it('a system needs its players: the AI picks the system the squad can actually run', () => {
    // Measured, and deliberately not asserted as an outcome: a late flyer still blocks lifted balls
    // near his own goal, so slow flyers did not concede more over 40 corners. What IS a hockey claim
    // is who gets to play what — a club without a flyer or a reading keeper blocks.
    const outfield = (pace: number, aggression = 12, discipline = 12) => Array.from({ length: 10 }, () => ({ physical: { pace, acceleration: pace }, mental: { aggression, discipline } }));
    const keeper = (read: number) => ({ goalkeeper: { oneOnOne: read, pcReading: read } });
    expect(pcDefenceFor(outfield(8), keeper(10))).toBe('block');
    expect(pcDefenceFor(outfield(13), keeper(10))).toBe('runnerLeads');
    expect(pcDefenceFor(outfield(16), keeper(10))).toBe('doubleCharge');
    // an elite reading keeper beats an average flyer to the job
    expect(pcDefenceFor(outfield(12), keeper(17))).toBe('keeperLeads');
    // a disciplined, cautious squad does not fly even when it is quick
    expect(pcDefenceFor(outfield(13, 6, 18), keeper(10))).toBe('block');
  });

  it('the castle is legal: no defender crosses the backline before the injection, in any system', () => {
    for (const s of Object.keys(PC_DEFENCES) as PcDefenceId[]) {
      const log = corner(7000, 'dragFlick', s, { frames: true });
      const taken = log.events.find((e) => e.t === 'PenaltyCornerTaken')?.tick ?? 0;
      expect(taken).toBeGreaterThan(0);
      const ids = log.header.playerIds;
      for (const f of log.frames) {
        if (f.tick >= taken || f.tick < 2) continue; // the award's placement lands on tick 1
        ids.forEach((id, i) => {
          if (id <= 12 || id > 22) return; // the defending outfielders (the keeper stands on his line)
          const x = f.players[i * FRAME_PLAYER_STRIDE] ?? 0;
          // behind the backline (castle) or beyond the centre line (second wave): nowhere in between
          const legal = x > HALF_LENGTH - 0.25 || x < 0.5;
          expect(legal, `${s}: defender ${id} at x=${x.toFixed(2)} on tick ${f.tick}`).toBe(true);
        });
      }
    }
  }, 120_000);
});
