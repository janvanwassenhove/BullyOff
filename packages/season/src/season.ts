/**
 * The season loop (Phase 6): advance match days through a MatchRunner, close the
 * regular phase into play-offs (built FIRST, per BRIEF), resolve ties incl.
 * shoot-outs, play-downs, promotion/relegation, finances, development, then roll
 * into the next season. Deterministic; a save resumes identically.
 */
import { Rng, clamp } from '@bullyoff/shared';
import type { ClubId, Fixture, Season, SeasonSummary, Tier, World } from './model.js';
import { generateFinal, generateFixtures, generatePlaydown, generatePlayoffs } from './fixtures.js';
import { fixtureSetup, playFixture, recordFixture, resolveShootOut, type MatchRunner } from './matchday.js';
import { matchStats, type MatchLog } from '@bullyoff/engine';
import { standings, tieAggregate } from './table.js';
import { developSeason, recomputeClubLevels } from './develop.js';
import { seasonFinances } from './finance.js';

export interface AdvanceOptions {
  runner: MatchRunner;
  /** Keep a full replay for fixtures involving this club (the user's). */
  keepReplayFor?: ClubId | null;
  /** Fixtures the caller wants to run itself (e.g. the user's, in a worker with frames): skipped here. */
  skip?: (f: Fixture) => boolean;
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
  for (const f of fixturesToday(w)) {
    if (opts.skip?.(f)) continue;
    const keep = !!opts.keepReplayFor && (f.home === opts.keepReplayFor || f.away === opts.keepReplayFor);
    playFixture(w, f, opts.runner, keep);
    settleKnockout(w, f);
    played.push(f);
  }
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
  const tieFixtures = s.fixtures.filter((x) => x.tieId === f.tieId && x.phase === f.phase && x.tier === f.tier);
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

  const po = s.playoffs.find((p) => p.tier === f.tier);
  if (f.phase === 'playoff-semi' && po) {
    const semisDone = po.semis.map((id) => s.fixtures.find((x) => x.id === id)).every((x) => x?.played);
    if (semisDone) {
      const winners = po.semis.map((id) => s.fixtures.find((x) => x.id === id)).map((x) => x ? semiWinner(x) : null).filter((x): x is ClubId => !!x);
      const [w1, w2] = winners;
      if (w1 && w2 && po.final.length === 0) {
        const twoLeg = w.profile === 'womens'; // Belgian W 2024–25: two-leg final; M: single (open question #4)
        const finals = generateFinal(w, f.tier, w1, w2, s.day + 1, twoLeg);
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
  for (const tier of [1, 2] as Tier[]) {
    const table = standings(w, tier).map((r) => r.club);
    const { semis } = generatePlayoffs(w, tier, table, w.profile === 'womens');
    s.fixtures.push(...semis);
    s.playoffs.push({ tier, semis: semis.map((x) => x.id), final: [], champion: null });
  }
  // play-down: tier-1 second-last vs tier-2 runner-up, two legs
  const t1 = standings(w, 1).map((r) => r.club), t2 = standings(w, 2).map((r) => r.club);
  const secondLast = t1[t1.length - 2], runnerUp2 = t2[1];
  if (secondLast && runnerUp2) {
    const pd = generatePlaydown(w, secondLast, runnerUp2, s.day);
    s.fixtures.push(...pd);
    s.playdowns = { tier1Club: secondLast, tier2Club: runnerUp2, fixtures: pd.map((x) => x.id), winner: null };
  }
  s.days = Math.max(s.days, s.day + 4);
}

function finishSeason(w: World): void {
  const s = w.season;
  s.finished = true;
  const t1 = standings(w, 1), t2 = standings(w, 2);
  const champion = s.playoffs.find((p) => p.tier === 1)?.champion ?? t1[0]?.club ?? '';
  const t2champion = s.playoffs.find((p) => p.tier === 2)?.champion ?? t2[0]?.club ?? '';
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
  const finalFx = s.playoffs.find((p) => p.tier === 1)?.final.map((id) => s.fixtures.find((x) => x.id === id)).filter((x): x is Fixture => !!x) ?? [];
  const finalStr = finalFx.map((x) => `${x.home} ${x.result?.home ?? 0}-${x.result?.away ?? 0} ${x.away}${x.result?.shootOut ? ` (SO ${x.result.shootOut[0]}-${x.result.shootOut[1]})` : ''}`).join(' / ');
  const scorers = Object.values(w.persons).filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || a.id - b.id)[0];
  const summary: SeasonSummary = {
    year: w.year, champion, regularWinner: t1[0]?.club ?? '', playoffFinal: [finalFx[0]?.home ?? '', finalFx[0]?.away ?? '', finalStr],
    promoted, relegated, topScorer: scorers ? { person: scorers.id, goals: scorers.goals } : null,
  };
  w.history.push(summary);
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
  for (const c of Object.values(w.clubs)) c.reputation = clamp(c.reputation * 0.9 + (c.tier === 1 ? 6 : 2) + (last.champion === c.id ? 12 : 0) + (last.relegated.includes(c.id) ? -10 : 0), 5, 99);
  w.year++;
  w.season = generateFixtures(w);
}

/** Simulate to the end of the current season with a runner. */
export function playSeason(w: World, runner: MatchRunner, keepReplayFor: ClubId | null = null): void {
  let guard = 0;
  while (!w.season.finished && guard++ < 500) advanceDay(w, { runner, keepReplayFor });
  if (!w.season.finished) throw new Error('season did not finish');
}
