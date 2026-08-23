/**
 * Match day: turn fixtures into results through the engine (default) or a quick
 * statistical resolver (for instant-sim / long-horizon tests — clearly labelled).
 * Also: squad selection, shoot-outs, injuries and per-player bookkeeping.
 */
import { Rng, clamp, dmath } from '@bullyoff/shared';
import { FIH_OUTDOOR_FAST, type Laws } from '@bullyoff/rules';
import {
  aiController, getProfile, matchStats, simulateMatch, squadsFromSetup, encodeReplay,
  type MatchLog, type MatchSetup, type MatchStats, type PcBattery, type PlayerSetup, type Role, type TeamTactics,
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

export const FORMATION_ROLES: Role[] = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];

/**
 * Who can actually play on Saturday: not injured, and not one of the amateur-hockey absences
 * (work, exams, a wedding) that `availability` models. Deterministic in the fixture seed, so the
 * squad screen can show the same answer before the match that the match day will use.
 */
export function availableFor(w: World, club: ClubId, seed: number): Person[] {
  const rng = new Rng(seed, 5000);
  // Every player draws, injured or not: whether someone can make it on Saturday is about them, not
  // about who else is hurt. (Before Phase 10.2 the injured skipped the draw, so one injury shifted
  // the stream and quietly changed which team-mates were available — spooky once a coach picks a sheet.)
  return clubPlayers(w, club).filter((p) => { const roll = rng.next(); return p.injuredDays === 0 && roll < p.availability + 0.15; });
}

/** The seed `selectSquad` uses for a club in a fixture — the squad screen needs the same one. */
export const squadSeed = (f: Fixture, club: ClubId): number => f.seed + (f.home === club ? 0 : 1);

/**
 * Pick 11 starters by formation slot and up to 5 subs. Deterministic.
 * The coach's team sheet (`club.lineup`) wins wherever the player is available; every slot they
 * left open, and every pick who cannot play, falls back to the assistant's choice on rating.
 */
export function selectSquad(w: World, club: ClubId, seed: number): { starters: Person[]; bench: Person[] } {
  const fit = availableFor(w, club, seed);
  const rating = (p: Person): number => {
    const a = p.attrs;
    return p.role === 'GK'
      ? (a.goalkeeper.reflexes + a.goalkeeper.positioning + a.goalkeeper.oneOnOne) / 3
      : (a.technical.firstTouch + a.technical.push + a.technical.hit + a.mental.decisions + a.mental.positioning + a.physical.pace + a.physical.stamina) / 7;
  };
  const pool = [...fit].sort((a, b) => rating(b) - rating(a) || a.id - b.id);
  const byId = new Map(fit.map((p) => [p.id, p]));
  const sheet = w.clubs[club]?.lineup ?? null;
  const starters: Person[] = [];
  const used = new Set<number>();
  FORMATION_ROLES.forEach((role, slot) => {
    // the coach's man for this slot, when he can play
    const wanted = sheet?.starters[slot];
    let pick = wanted === undefined ? undefined : byId.get(wanted);
    if (pick && used.has(pick.id)) pick = undefined;
    pick ??= pool.find((p) => p.role === role && !used.has(p.id));
    // fill from any role if a line is short (a real amateur squad does this every week)
    pick ??= pool.find((p) => !used.has(p.id) && p.role !== 'GK');
    pick ??= pool.find((p) => !used.has(p.id));
    if (pick) { starters.push(pick); used.add(pick.id); }
  });
  const named: Person[] = [];
  for (const id of sheet?.bench ?? []) {
    const p = byId.get(id);
    if (p && !used.has(p.id)) { named.push(p); used.add(p.id); }
  }
  const bench = [...named, ...pool.filter((p) => !used.has(p.id))].slice(0, 5);
  return { starters, bench };
}

/**
 * What the coach will actually have on Saturday: the eleven and the bench as they will be picked,
 * plus the men on the team sheet who cannot play. The confirmation before a coached match shows it,
 * so a lineup that quietly lost two players is never a surprise at the first whistle.
 */
export function teamSheet(w: World, f: Fixture, club: ClubId): { starters: Person[]; bench: Person[]; missing: Person[] } {
  const seed = squadSeed(f, club);
  const { starters, bench } = selectSquad(w, club, seed);
  const playing = new Set([...starters, ...bench].map((p) => p.id));
  const wanted = w.clubs[club]?.lineup;
  const missing = wanted
    ? [...wanted.starters, ...wanted.bench].filter((id) => !playing.has(id)).map((id) => w.persons[id]).filter((p): p is Person => !!p)
    : [];
  return { starters, bench, missing };
}

/**
 * The engine setup for a fixture (Phase 7: the manager coaches the user's fixture live in the engine worker
 * with exactly this setup, then records the log back with `recordFixture`). Deterministic in world + fixture.
 */
export function fixtureSetup(w: World, f: Fixture, keepFrames = true): { setup: MatchSetup; idMap: Map<number, number>; tactics: [TeamTactics, TeamTactics] } {
  const r = toSetup(w, f, keepFrames);
  const home = w.clubs[f.home], away = w.clubs[f.away];
  if (!home || !away) throw new Error(`fixture ${f.id}: unknown club`);
  return { ...r, tactics: [tacticsFor(home, r.idMap), tacticsFor(away, r.idMap)] };
}

/**
 * The club's tactics for one fixture, with the penalty-corner battery translated from the person
 * ids a coach picks on the tactics screen to the on-pitch ids the engine speaks. A man who did not
 * make the eleven simply drops out of the battery and the AI picks that role, which is what happens
 * on a real Saturday.
 */
function tacticsFor(club: Club, idMap: Map<number, number>): TeamTactics {
  const picks = club.pcBattery;
  if (!picks) return { ...club.tactics };
  const local = new Map<number, number>();
  for (const [id, person] of idMap) local.set(person, id);
  const battery: PcBattery = {};
  const set = (role: keyof PcBattery, person: number | null): void => {
    const id = person === null ? undefined : local.get(person);
    if (id !== undefined) battery[role] = id;
  };
  set('injector', picks.injector); set('trapper', picks.trapper); set('striker', picks.striker);
  return Object.keys(battery).length > 0 ? { ...club.tactics, pcBattery: battery } : { ...club.tactics };
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
export const engineRunner: MatchRunner = (w, f, opts) => engineRunnerWith(FIH_OUTDOOR_FAST)(w, f, opts);

/** The engine runner under other laws (tests use short quarters for whole-season runs). */
export const engineRunnerWith = (laws: Laws): MatchRunner => (w, f, opts) => {
  const { setup, idMap } = toSetup(w, f, opts.keepReplay);
  setup.laws = laws;
  const home = w.clubs[f.home], away = w.clubs[f.away];
  if (!home || !away) throw new Error(`fixture ${f.id}: unknown club`);
  const tactics: [TeamTactics, TeamTactics] = [tacticsFor(home, idMap), tacticsFor(away, idMap)];
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
  recordFixture(w, f, runner(w, f, { keepReplay }), keepReplay);
}

/** Record a finished match (from a runner, or a coached match played elsewhere) on the fixture and the persons. */
export function recordFixture(w: World, f: Fixture, out: MatchOutcome, keepReplay: boolean): void {
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
