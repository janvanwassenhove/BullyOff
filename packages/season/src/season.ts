/**
 * The season loop (Phase 6): advance match days through a MatchRunner, close the
 * regular phase into play-offs (built FIRST, per BRIEF), resolve ties incl.
 * shoot-outs, play-downs, promotion/relegation, finances, development, then roll
 * into the next season. Deterministic; a save resumes identically.
 */
import { Rng, clamp } from '@bullyoff/shared';
import type { ClubId, Country, Fixture, NationId, NationsFixture, Season, SeasonSummary, World } from './model.js';
import { generateFinal, generateFixtures, generatePlaydown, generatePlayoffs, leaguesOf } from './fixtures.js';
import { fixtureSetup, playFixture, recordFixture, resolveShootOut, type MatchRunner } from './matchday.js';
import { matchStats, type MatchLog } from '@bullyoff/engine';
import { standings, tieAggregate } from './table.js';
import { normaliseLevels, developSeason, recomputeClubLevels } from './develop.js';
import { seasonFinances } from './finance.js';
import { buildNations } from './nations.js';

export interface AdvanceOptions {
  runner: MatchRunner;
  /** Keep a full replay for fixtures involving this club (the user's). */
  keepReplayFor?: ClubId | null;
  /** Fixtures the caller wants to run itself (e.g. the user's, in a worker with frames): skipped here. */
  skip?: (f: Fixture) => boolean;
  /** Called before each fixture is played — a match day takes real seconds, and a user staring at a
   *  dead button assumes the game hung. `i` is 0-based, `n` the day's fixture count. */
  onFixture?: (i: number, n: number, f: Fixture) => void;
  /**
   * Pick a different runner per fixture (Phase 12): the app runs the user's own league through the
   * real engine and the four foreign leagues through the labelled quick resolver — six engine
   * matches a day, not thirty-six. Omitted = `runner` for everything.
   */
  runnerFor?: (f: Fixture) => MatchRunner;
}

/** Fixtures scheduled on the current day. */
export const fixturesToday = (w: World): Fixture[] => w.season.fixtures.filter((f) => f.day === w.season.day && !f.played);

/** Is today inside the winter break? */
export const inWinterBreak = (s: Season): boolean => s.day >= s.winterBreak[0] && s.day <= s.winterBreak[1];

/**
 * Play today's fixtures and move to tomorrow. Handles the transition into
 * play-offs when the regular phase is complete and season end after the finals.
 * Returns the fixtures played.
 */
export function advanceDay(w: World, opts: AdvanceOptions): Fixture[] {
  const s = w.season;
  if (s.finished) return [];
  const played: Fixture[] = [];
  const today = fixturesToday(w).filter((f) => !opts.skip?.(f));
  today.forEach((f, i) => {
    opts.onFixture?.(i, today.length, f);
    const keep = !!opts.keepReplayFor && (f.home === opts.keepReplayFor || f.away === opts.keepReplayFor);
    playFixture(w, f, opts.runnerFor?.(f) ?? opts.runner, keep);
    settleKnockout(w, f);
    played.push(f);
  });
  // the nations competition plays its rounds alongside the club calendar, resolved off-screen
  resolveNationsDay(w);
  // injuries heal by a day
  for (const p of Object.values(w.persons)) if (p.injuredDays > 0) p.injuredDays--;
  // winter break: a real interval — recovery (extra healing) and a training block (small physical uptick)
  if (inWinterBreak(s)) {
    for (const p of Object.values(w.persons)) if (p.injuredDays > 0) p.injuredDays = Math.max(0, p.injuredDays - 1);
  }
  s.day++;
  // regular phase complete? → build play-offs and play-downs
  const regularLeft = s.fixtures.filter((f) => f.phase === 'regular' && !f.played);
  if (!s.regularDone && regularLeft.length === 0 && s.fixtures.filter((f) => f.phase === 'regular').length > 0) {
    s.regularDone = true;
    startPlayoffs(w);
  }
  // all fixtures done → finish
  if (s.regularDone && s.fixtures.every((f) => f.played)) finishSeason(w);
  return played;
}

/** For knock-out fixtures: after the deciding match, resolve the tie (shoot-out if level) and schedule the next round. */
function settleKnockout(w: World, f: Fixture): void {
  const s = w.season;
  if (f.phase === 'regular' || !f.result) return;
  // country included: five leagues share the same tie numbering (semi 1 exists in every country)
  const tieFixtures = s.fixtures.filter((x) => x.tieId === f.tieId && x.phase === f.phase && x.tier === f.tier && x.country === f.country);
  if (tieFixtures.some((x) => !x.played)) return; // second leg still to come
  const a = tieFixtures[0]?.home === f.home && f.leg !== 2 ? f.home : (tieFixtures[0]?.away ?? f.away);
  const b = a === f.home ? f.away : f.home;
  let [ga, gb] = tieAggregate(tieFixtures, a, b);
  let winner: ClubId;
  if (ga === gb) {
    // Shoot-out decides (FIH competition regulations; no extra time in Belgian play-offs — PROVISIONAL)
    const [sa, sb] = resolveShootOut(w, f.seed ^ 0x5eed, a, b);
    f.result.shootOut = f.home === a ? [sa, sb] : [sb, sa];
    winner = sa > sb ? a : b;
    ga = sa; gb = sb;
  } else winner = ga > gb ? a : b;

  // European rounds: quarters → semis → final, all inside the winter-break block
  if (f.phase.startsWith('eu-') && s.europe) {
    const eu = s.europe;
    const done = (ids: number[]): boolean => ids.map((id) => s.fixtures.find((x) => x.id === id)).every((x) => x?.played);
    const winnerOf = (id: number): ClubId | null => { const x = s.fixtures.find((y) => y.id === id); return x ? semiWinner(x) : null; };
    if (f.phase === 'eu-quarter' && done(eu.quarters) && eu.semis.length === 0) {
      const ws = eu.quarters.map(winnerOf).filter((x): x is ClubId => !!x);
      const rng = new Rng(w.seed, 3300 + w.year);
      const semis: Fixture[] = [0, 1].map((i) => ({
        id: w.nextFixtureId++, day: s.day + 1, tier: 1, phase: 'eu-semi' as const, country: w.country,
        home: ws[i] ?? '', away: ws[3 - i] ?? '', played: false, seed: rng.nextU32(), tieId: 110 + i,
      }));
      s.fixtures.push(...semis); eu.semis = semis.map((x) => x.id);
      s.days = Math.max(s.days, s.day + 3);
    } else if (f.phase === 'eu-semi' && done(eu.semis) && eu.final.length === 0) {
      const ws = eu.semis.map(winnerOf).filter((x): x is ClubId => !!x);
      const rng = new Rng(w.seed, 3400 + w.year);
      const final: Fixture = {
        id: w.nextFixtureId++, day: s.day + 1, tier: 1, phase: 'eu-final', country: w.country,
        home: ws[0] ?? '', away: ws[1] ?? '', played: false, seed: rng.nextU32(), tieId: 120,
      };
      s.fixtures.push(final); eu.final = [final.id];
      s.days = Math.max(s.days, s.day + 3);
    } else if (f.phase === 'eu-final') {
      eu.champion = winner;
    }
    return;
  }

  const po = s.playoffs.find((p) => p.tier === f.tier && p.country === f.country);
  if (f.phase === 'playoff-semi' && po) {
    const semisDone = po.semis.map((id) => s.fixtures.find((x) => x.id === id)).every((x) => x?.played);
    if (semisDone) {
      const winners = po.semis.map((id) => s.fixtures.find((x) => x.id === id)).map((x) => x ? semiWinner(x) : null).filter((x): x is ClubId => !!x);
      const [w1, w2] = winners;
      if (w1 && w2 && po.final.length === 0) {
        const twoLeg = w.profile === 'womens'; // Belgian W 2024–25: two-leg final; M: single (open question #4)
        const finals = generateFinal(w, f.tier, f.country, w1, w2, s.day + 1, twoLeg);
        s.fixtures.push(...finals); po.final = finals.map((x) => x.id);
        s.days = Math.max(s.days, s.day + 3);
      }
    }
  } else if (f.phase === 'playoff-final' && po) {
    po.champion = winner;
  } else if (f.phase === 'playdown' && s.playdowns) {
    s.playdowns.winner = winner;
  }
}

/**
 * Resolve today's nations-competition matches: Poisson goals from the two nations' strengths (the
 * same labelled model as the quick club resolver — these matches never run the engine).
 */
function resolveNationsDay(w: World): void {
  const s = w.season;
  if (!s.nations) return;
  const level = (id: string): number => w.nations.find((n) => n.id === id)?.level ?? 14;
  const play = (f: NationsFixture): void => {
    const rng = new Rng(f.seed, 6100);
    const base = w.profile === 'womens' ? 1.6 : 2.4; // international hockey is tighter than club hockey
    const diff = (level(f.home) - level(f.away)) * 0.16;
    const pois = (m: number): number => { let k = 0, p = 1; const L = Math.exp(-m); do { k++; p *= rng.next(); } while (p > L); return k - 1; };
    f.result = { home: pois(clamp(base * Math.exp(diff + 0.08), 0.3, 6)), away: pois(clamp(base * Math.exp(-diff - 0.08), 0.3, 6)) };
    f.played = true;
  };
  for (const f of s.nations.fixtures) if (!f.played && f.day <= s.day) play(f);
  if (s.nations.champion === null && s.nations.fixtures.every((f) => f.played)) {
    s.nations.champion = (nationsTable(w)[0]?.id as NationId | undefined) ?? null;
  }
}

/** The nations-competition table (3/1/0 points, then goal difference, goals for, name). */
export function nationsTable(w: World): { id: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }[] {
  const rows = new Map<string, { id: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }>();
  for (const n of w.nations) rows.set(n.id, { id: n.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  for (const f of w.season.nations?.fixtures ?? []) {
    const r = f.result; if (!f.played || !r) continue;
    const h = rows.get(f.home), a = rows.get(f.away);
    if (!h || !a) continue;
    h.p++; a.p++; h.gf += r.home; h.ga += r.away; a.gf += r.away; a.ga += r.home;
    if (r.home > r.away) { h.w++; a.l++; h.pts += 3; } else if (r.home < r.away) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return [...rows.values()].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.id.localeCompare(b.id));
}

function semiWinner(f: Fixture): ClubId | null {
  if (!f.result) return null;
  const { home, away, shootOut } = f.result;
  if (home !== away) return home > away ? f.home : f.away;
  if (shootOut) return shootOut[0] > shootOut[1] ? f.home : f.away;
  return null;
}

function startPlayoffs(w: World): void {
  const s = w.season;
  s.playoffs = [];
  // Every league in the world closes its season with a title final four — the format the Belgian,
  // Dutch, German and French top flights actually use (England's championship pool is modelled the
  // same way as data; the differences that matter are the pyramid, not the bracket).
  for (const { country, tier } of leaguesOf(w)) {
    const table = standings(w, tier, country).map((r) => r.club);
    const { semis } = generatePlayoffs(w, tier, country, table, w.profile === 'womens');
    s.fixtures.push(...semis);
    s.playoffs.push({ tier, country, semis: semis.map((x) => x.id), final: [], champion: null });
  }
  // play-down: only where the pyramid exists (the user's country has two tiers)
  const t1 = standings(w, 1, w.country).map((r) => r.club), t2 = standings(w, 2, w.country).map((r) => r.club);
  const secondLast = t1[t1.length - 2], runnerUp2 = t2[1];
  if (secondLast && runnerUp2 && t2.length > 0) {
    const pd = generatePlaydown(w, w.country, secondLast, runnerUp2, s.day);
    s.fixtures.push(...pd);
    s.playdowns = { tier1Club: secondLast, tier2Club: runnerUp2, fixtures: pd.map((x) => x.id), winner: null };
  }
  s.days = Math.max(s.days, s.day + 4);
}

function finishSeason(w: World): void {
  const s = w.season;
  s.finished = true;
  // any nations rounds the calendar never reached (a season cut short) still resolve
  resolveNationsDay(w);
  if (s.nations?.champion === null) { for (const f of s.nations.fixtures) f.day = Math.min(f.day, s.day); resolveNationsDay(w); }
  const t1 = standings(w, 1), t2 = standings(w, 2);
  const champion = s.playoffs.find((p) => p.tier === 1 && p.country === w.country)?.champion ?? t1[0]?.club ?? '';
  const t2champion = s.playoffs.find((p) => p.tier === 2 && p.country === w.country)?.champion ?? t2[0]?.club ?? '';
  const relegatedAuto = t1[t1.length - 1]?.club;
  const promoted: ClubId[] = [], relegated: ClubId[] = [];
  // tier-2 play-off champion up, tier-1 last down
  if (t2champion) promoted.push(t2champion);
  if (relegatedAuto) relegated.push(relegatedAuto);
  // play-down: the tier-1 club stays only if it won. If it lost to a tier-2 club that is already going up as
  // champion, the next-best tier-2 side (the beaten finalist, else table order) takes the place — the tier stays at 12.
  if (s.playdowns?.winner && s.playdowns.winner === s.playdowns.tier2Club) {
    relegated.push(s.playdowns.tier1Club);
    let up: ClubId | undefined = s.playdowns.tier2Club;
    if (up === t2champion) {
      const fin = s.playoffs.find((p) => p.tier === 2)?.final.map((id) => s.fixtures.find((x) => x.id === id)).filter((x): x is Fixture => !!x) ?? [];
      const finalist = fin.map((x) => (x.home === t2champion ? x.away : x.home)).find((c) => c !== t2champion);
      up = finalist ?? t2.map((r) => r.club).find((c) => c !== t2champion && c !== s.playdowns?.tier2Club);
    }
    if (up && !promoted.includes(up)) promoted.push(up);
  }
  const finalFx = s.playoffs.find((p) => p.tier === 1 && p.country === w.country)?.final.map((id) => s.fixtures.find((x) => x.id === id)).filter((x): x is Fixture => !!x) ?? [];
  const finalStr = finalFx.map((x) => `${x.home} ${x.result?.home ?? 0}-${x.result?.away ?? 0} ${x.away}${x.result?.shootOut ? ` (SO ${x.result.shootOut[0]}-${x.result.shootOut[1]})` : ''}`).join(' / ');
  const scorers = Object.values(w.persons).filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || a.id - b.id)[0];
  // the foreign champions: each league's play-off winner (regular-season leader as fallback)
  const foreignChampions: Partial<Record<Country, ClubId>> = {};
  for (const { country, tier } of leaguesOf(w)) {
    if (tier !== 1 || country === w.country) continue;
    const c = s.playoffs.find((p) => p.tier === 1 && p.country === country)?.champion ?? standings(w, 1, country)[0]?.club;
    if (c) foreignChampions[country] = c;
  }
  const summary: SeasonSummary = {
    year: w.year, champion, regularWinner: t1[0]?.club ?? '', playoffFinal: [finalFx[0]?.home ?? '', finalFx[0]?.away ?? '', finalStr],
    promoted, relegated, topScorer: scorers ? { person: scorers.id, goals: scorers.goals } : null,
    foreignChampions, europeChampion: s.europe?.champion ?? null, nationsChampion: s.nations?.champion ?? null,
  };
  w.history.push(summary);
  w.clubs[champion]?.honours.titles.push(w.year);
  for (const c of Object.values(foreignChampions)) w.clubs[c]?.honours.titles.push(w.year);
  for (const id of promoted) w.clubs[id]?.honours.promotions.push(w.year);
}

/** Roll the world into the next season: tiers, finances, development, new fixtures. */
/**
 * Record a match the coach played live (Phase 7): the log came from the engine worker started with
 * `fixtureSetup(w, f)`; results, stats, goals, injuries and the replay land exactly as for a simulated fixture,
 * knock-out ties are settled, and `advanceDay` then plays the rest of the day.
 */
export function recordCoachedFixture(w: World, fixtureId: number, log: MatchLog): Fixture {
  const f = w.season.fixtures.find((x) => x.id === fixtureId);
  if (!f) throw new Error(`fixture ${fixtureId} not found`);
  if (f.played) throw new Error(`fixture ${fixtureId} already played`);
  const { idMap } = fixtureSetup(w, f);
  const stats = matchStats(log);
  recordFixture(w, f, { home: stats.goals[0], away: stats.goals[1], stats, log, idMap }, true);
  settleKnockout(w, f);
  return f;
}

export function newSeason(w: World): void {
  const last = w.history[w.history.length - 1];
  if (!last || !w.season.finished) throw new Error('season not finished');
  for (const id of last.promoted) { const c = w.clubs[id]; if (c) { c.tier = 1; c.seasonsInTier = 0; } }
  for (const id of last.relegated) { const c = w.clubs[id]; if (c) { c.tier = 2; c.seasonsInTier = 0; } }
  for (const c of Object.values(w.clubs)) c.seasonsInTier++;
  seasonFinances(w);
  // relegated clubs lose players; promoted clubs are stretched (BRIEF Phase 8 design consequences, modelled now)
  const rng = new Rng(w.seed, 9500 + w.year);
  for (const id of last.relegated) {
    for (const p of Object.values(w.persons)) if (p.club === id && !p.youth && !p.retired && p.attrs.hidden.ambition >= 13 && rng.chance(0.35)) {
      // moves to a random tier-1 club
      const t1 = Object.values(w.clubs).filter((c) => c.tier === 1);
      const dest = t1[rng.int(t1.length)]; if (dest) p.club = dest.id;
    }
  }
  developSeason(w, (club) => (club ? (w.clubs[club]?.facilities ?? 3) : 3));
  recomputeClubLevels(w);
  normaliseLevels(w, rng);
  recomputeClubLevels(w);
  for (const c of Object.values(w.clubs)) c.reputation = clamp(c.reputation * 0.9 + (c.tier === 1 ? 6 : 2) + (last.champion === c.id ? 12 : 0) + (last.relegated.includes(c.id) ? -10 : 0), 5, 99);
  w.year++;
  // national squads develop with their players; a nation is only ever as good as its best fourteen
  w.nations = buildNations(w.persons, w.year);
  w.season = generateFixtures(w);
}

/** Simulate to the end of the current season with a runner. */
export function playSeason(w: World, runner: MatchRunner, keepReplayFor: ClubId | null = null): void {
  let guard = 0;
  while (!w.season.finished && guard++ < 500) advanceDay(w, { runner, keepReplayFor });
  if (!w.season.finished) throw new Error('season did not finish');
}
