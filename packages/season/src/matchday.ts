/**
 * Match day: turn fixtures into results through the engine (default) or a quick
 * statistical resolver (for instant-sim / long-horizon tests — clearly labelled).
 * Also: squad selection, shoot-outs, injuries and per-player bookkeeping.
 */
import { Rng, clamp, dmath } from '@bullyoff/shared';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import {
  aiController, getProfile, matchStats, simulateMatch, squadsFromSetup, encodeReplay,
  type MatchLog, type MatchSetup, type MatchStats, type PlayerSetup, type Role, type TeamTactics,
} from '@bullyoff/engine';
import type { Club, ClubId, Fixture, Person, World } from './model.js';
import { ageOf, clubPlayers } from './world.js';

export interface MatchOutcome {
  home: number;
  away: number;
  stats?: MatchStats;
  log?: MatchLog;
  /** local player id → person id, for goals/minutes/injuries */
  idMap?: Map<number, number>;
}

export type MatchRunner = (w: World, f: Fixture, opts: { keepReplay: boolean }) => MatchOutcome;

const FORMATION_ROLES: Role[] = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];

/** Pick 11 starters by formation slot from fit, available players; up to 5 subs. Deterministic. */
export function selectSquad(w: World, club: ClubId, seed: number): { starters: Person[]; bench: Person[] } {
  const rng = new Rng(seed, 5000);
  const fit = clubPlayers(w, club).filter((p) => p.injuredDays === 0 && rng.next() < p.availability + 0.15);
  const rating = (p: Person): number => {
    const a = p.attrs;
    return p.role === 'GK'
      ? (a.goalkeeper.reflexes + a.goalkeeper.positioning + a.goalkeeper.oneOnOne) / 3
      : (a.technical.firstTouch + a.technical.push + a.technical.hit + a.mental.decisions + a.mental.positioning + a.physical.pace + a.physical.stamina) / 7;
  };
  const pool = [...fit].sort((a, b) => rating(b) - rating(a) || a.id - b.id);
  const starters: Person[] = [];
  const used = new Set<number>();
  for (const role of FORMATION_ROLES) {
    let pick = pool.find((p) => p.role === role && !used.has(p.id));
    // fill from any role if a line is short (a real amateur squad does this every week)
    pick ??= pool.find((p) => !used.has(p.id) && p.role !== 'GK');
    pick ??= pool.find((p) => !used.has(p.id));
    if (pick) { starters.push(pick); used.add(pick.id); }
  }
  const bench = pool.filter((p) => !used.has(p.id)).slice(0, 5);
  return { starters, bench };
}

function toSetup(w: World, f: Fixture, keepFrames: boolean): { setup: MatchSetup; idMap: Map<number, number> } {
  const idMap = new Map<number, number>();
  const players: PlayerSetup[] = [];
  const build = (club: Club, team: 0 | 1, base: number): void => {
    const { starters, bench } = selectSquad(w, club.id, f.seed + team);
    const end = team === 0 ? 1 : -1;
    starters.forEach((p, i) => {
      const local = base + i + 1;
      idMap.set(local, p.id);
      const slot = FORMATION_SHAPE[i] ?? [-20, 0];
      players.push({ id: local, team, x: end * -Math.abs(slot[0]), y: end * slot[1], heading: end > 0 ? 0 : dmath.PI, role: FORMATION_ROLES[i] ?? p.role, attributes: p.attrs, isGoalkeeper: i === 0 });
    });
    bench.forEach((p, i) => {
      const local = base + 12 + i;
      idMap.set(local, p.id);
      players.push({ id: local, team, x: 0, y: end * -30, heading: 0, role: p.role, attributes: p.attrs, onPitch: false });
    });
  };
  const home = w.clubs[f.home], away = w.clubs[f.away];
  if (!home || !away) throw new Error(`fixture ${f.id}: unknown club`);
  build(home, 0, 0);
  build(away, 1, 100);
  const setup: MatchSetup = { profile: w.profile, surface: home.surface, players, frameEvery: keepFrames ? 1 : 0, laws: FIH_OUTDOOR_FAST, firstCentrePass: (f.seed & 1) as 0 | 1 };
  return { setup, idMap };
}
const FORMATION_SHAPE: [number, number][] = [[42, 0], [30, -14], [32, -5], [32, 5], [30, 14], [15, -12], [18, 0], [15, 12], [4, -16], [2, 0], [4, 16]];

/** The real thing: the full engine with the utility AI, both squads from the world. */
export const engineRunner: MatchRunner = (w, f, opts) => {
  const { setup, idMap } = toSetup(w, f, opts.keepReplay);
  const home = w.clubs[f.home], away = w.clubs[f.away];
  if (!home || !away) throw new Error(`fixture ${f.id}: unknown club`);
  const tactics: [TeamTactics, TeamTactics] = [home.tactics, away.tactics];
  const log = simulateMatch(setup, f.seed, aiController(f.seed, squadsFromSetup(setup.players, tactics), { profile: getProfile(w.profile), surface: setup.surface }));
  const stats = matchStats(log);
  return { home: stats.goals[0], away: stats.goals[1], stats, log, idMap };
};

/**
 * Quick resolver (NOT the engine): Poisson goals from club strength, home
 * advantage and surface. For instant-sim of far-away fixtures and 10-season
 * structural tests. Deterministic in the fixture seed. Labelled everywhere.
 */
export const quickRunner: MatchRunner = (w, f) => {
  const rng = new Rng(f.seed, 6000);
  const h = w.clubs[f.home], a = w.clubs[f.away];
  if (!h || !a) throw new Error('unknown club');
  const base = w.profile === 'womens' ? 1.8 : 2.7;
  const diff = (h.level - a.level) * 0.13;
  const lh = clamp(base * Math.exp(diff + 0.1), 0.3, 6), la = clamp(base * Math.exp(-diff - 0.1), 0.3, 6);
  const pois = (m: number): number => { let k = 0, p = 1; const L = Math.exp(-m); do { k++; p *= rng.next(); } while (p > L); return k - 1; };
  return { home: pois(lh), away: pois(la) };
};

/** Shoot-out (FIH: 5 each, then sudden death). One-on-one from 23 m, 8 s: attacker skill vs keeper. Deterministic. */
export function resolveShootOut(w: World, seed: number, a: ClubId, b: ClubId): [number, number] {
  const rng = new Rng(seed, 7000);
  const takers = (c: ClubId): Person[] => clubPlayers(w, c).filter((p) => p.role !== 'GK' && p.injuredDays === 0)
    .sort((x, y) => (y.attrs.technical.elimination + y.attrs.mental.composure) - (x.attrs.technical.elimination + x.attrs.mental.composure)).slice(0, 8);
  const keeper = (c: ClubId): Person | undefined => clubPlayers(w, c).filter((p) => p.role === 'GK' && p.injuredDays === 0).sort((x, y) => y.attrs.goalkeeper.oneOnOne - x.attrs.goalkeeper.oneOnOne)[0];
  const ta = takers(a), tb = takers(b), ka = keeper(a), kb = keeper(b);
  const pScore = (t: Person | undefined, k: Person | undefined): number => {
    const att = t ? (t.attrs.technical.elimination + t.attrs.mental.composure) / 40 : 0.5;
    const gk = k ? (k.attrs.goalkeeper.oneOnOne + k.attrs.goalkeeper.reflexes) / 40 : 0.5;
    return clamp(0.62 + 0.45 * (att - gk), 0.25, 0.85); // elite shoot-out conversion ≈ 55–65 %
  };
  let sa = 0, sb = 0;
  for (let i = 0; i < 5; i++) {
    if (rng.chance(pScore(ta[i % Math.max(1, ta.length)], kb))) sa++;
    if (rng.chance(pScore(tb[i % Math.max(1, tb.length)], ka))) sb++;
    // early finish when unreachable
    if (sa > sb + (4 - i) || sb > sa + (4 - i)) break;
  }
  let i = 5;
  while (sa === sb) {
    if (rng.chance(pScore(ta[i % Math.max(1, ta.length)], kb))) sa++;
    if (rng.chance(pScore(tb[i % Math.max(1, tb.length)], ka))) sb++;
    i++;
    if (i > 40) { sa++; break; } // safety
  }
  return [sa, sb];
}

/** Injuries after a match: chance per player from proneness, minutes and age; duration in match days. */
export function applyInjuries(w: World, persons: readonly Person[], seed: number): void {
  const rng = new Rng(seed, 8000);
  for (const p of persons) {
    const prone = p.attrs.hidden.injuryProneness / 20;
    const age = ageOf(p, w.year);
    const pInj = 0.012 + 0.03 * prone + (age > 30 ? 0.01 : 0);
    if (rng.chance(pInj)) p.injuredDays = 1 + rng.int(3 + Math.round(6 * prone));
  }
}

/** Play one fixture and record everything on the world. */
export function playFixture(w: World, f: Fixture, runner: MatchRunner, keepReplay: boolean): void {
  const out = runner(w, f, { keepReplay });
  f.played = true;
  f.result = { home: out.home, away: out.away };
  if (out.stats) f.stats = out.stats;
  if (out.log && keepReplay) f.replay = encodeReplay(out.log, 4);
  // per-player bookkeeping from the log
  if (out.log && out.idMap) {
    for (const e of out.log.events) {
      if (e.t === 'Goal' && e.scorerId !== null) { const pid = out.idMap.get(e.scorerId); const p = pid !== undefined ? w.persons[pid] : undefined; if (p) p.goals++; }
    }
    const involved = [...out.idMap.values()].map((id) => w.persons[id]).filter((p): p is Person => !!p);
    for (const p of involved) p.minutes += 60;
    applyInjuries(w, involved, f.seed);
  } else {
    // quick runner: no minutes; light injury pass on starters only
    for (const club of [f.home, f.away]) applyInjuries(w, selectSquad(w, club, f.seed).starters, f.seed);
  }
  // shoot-out for knock-out ties decided level (single match or second leg)
}
