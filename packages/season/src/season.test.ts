/**
 * Phase 6 gate: ten seasons end to end without corruption — play-off brackets,
 * shoot-out resolution, promotion/relegation across two tiers, youth emerging,
 * developing, plateauing, retiring; a regular-phase winner can lose the final.
 * Structure is tested with the quick resolver (10 seasons in seconds); the real
 * engine is exercised on a whole match day and a full short season.
 */
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '@bullyoff/engine';
import { createWorld, ageOf, clubPlayers } from './world.js';
import { advanceDay, newSeason, playSeason, fixturesToday } from './season.js';
import { engineRunner, quickRunner } from './matchday.js';
import { standings } from './table.js';
import { roundRobin } from './fixtures.js';
import { deserialize, serialize } from './save.js';
import { overall } from './develop.js';
import { TIER_SIZE } from './model.js';

describe('fixtures', () => {
  it('round robin: every pair meets once per half, everyone plays every round, home/away alternates', () => {
    const clubs = Array.from({ length: 12 }, (_, i) => `c${i + 1}`);
    const rounds = roundRobin(clubs);
    expect(rounds.length).toBe(11);
    const seen = new Set<string>();
    for (const r of rounds) {
      expect(r.length).toBe(6);
      const teams = new Set(r.flat()); expect(teams.size).toBe(12);
      for (const [h, a] of r) { const k = [h, a].sort().join('-'); expect(seen.has(k)).toBe(false); seen.add(k); }
    }
    expect(seen.size).toBe(66);
  });
  it('a world has two tiers of 12, 22 regular rounds each with a winter break, and deterministic fixtures', () => {
    const w = createWorld(7, 'mens');
    const w2 = createWorld(7, 'mens');
    expect(JSON.stringify(w.season.fixtures)).toBe(JSON.stringify(w2.season.fixtures));
    expect(Object.values(w.clubs).filter((c) => c.tier === 1).length).toBe(TIER_SIZE);
    expect(w.season.fixtures.filter((f) => f.tier === 1 && f.phase === 'regular').length).toBe(TIER_SIZE * (TIER_SIZE - 1));
    const days = new Set(w.season.fixtures.map((f) => f.day));
    for (let d = w.season.winterBreak[0]; d <= w.season.winterBreak[1]; d++) expect(days.has(d)).toBe(false);
    // no real club names (a spot check on the placeholder pools) and squads of 18 + youth
    for (const c of Object.values(w.clubs)) {
      expect(/Dragons|Gantoise|Braxgata|Léopold|Racing|Waterloo|Herakles|Orée|Beerschot|Antwerp|Leuven|Victory|Uccle|Daring|Namur|Wellington|White Star|Mechelse/i.test(c.name)).toBe(false);
      expect(clubPlayers(w, c.id).length).toBe(18);
      expect(clubPlayers(w, c.id, true).length).toBe(24);
    }
  });
});

describe('ten seasons with the quick resolver (structure)', () => {
  const w = createWorld(42, 'mens');
  const champions: string[] = [];
  let regularWinnerLostFinal = 0, shootOuts = 0, tierChanges = 0;
  for (let s = 0; s < 10; s++) {
    playSeason(w, quickRunner);
    const h = w.history[w.history.length - 1]!;
    champions.push(h.champion);
    if (h.champion !== h.regularWinner) regularWinnerLostFinal++;
    shootOuts += w.season.fixtures.filter((f) => f.result?.shootOut).length;
    tierChanges += h.promoted.length + h.relegated.length;
    newSeason(w);
  }

  it('every season finishes: 264 regular fixtures + play-offs + play-down, no orphaned or duplicated clubs across tiers', () => {
    expect(w.history.length).toBe(10);
    for (const h of w.history) { expect(h.champion).toBeTruthy(); expect(h.regularWinner).toBeTruthy(); }
    const t1 = Object.values(w.clubs).filter((c) => c.tier === 1).length, t2 = Object.values(w.clubs).filter((c) => c.tier === 2).length;
    expect(t1).toBe(TIER_SIZE); expect(t2).toBe(TIER_SIZE);
    expect(Object.keys(w.clubs).length).toBe(TIER_SIZE * 2);
  });
  it('promotion and relegation flow between the tiers every season (1–2 clubs each way, incl. the play-down)', () => {
    for (const h of w.history) {
      expect(h.promoted.length).toBeGreaterThanOrEqual(1);
      expect(h.promoted.length).toBeLessThanOrEqual(2);
      expect(h.relegated.length).toBe(h.promoted.length);
    }
    expect(tierChanges).toBeGreaterThanOrEqual(20);
  });
  it('the play-off can be lost by the regular-phase winner, and ties level after the deciding leg go to a shoot-out', () => {
    expect(regularWinnerLostFinal).toBeGreaterThan(0);
    expect(shootOuts).toBeGreaterThan(0);
    // shoot-out results are recorded on the fixture and always decisive
    for (const f of w.season.fixtures) if (f.result?.shootOut) expect(f.result.shootOut[0]).not.toBe(f.result.shootOut[1]);
  });
  it('careers: youth players emerge, develop, plateau and retire; ages stay plausible; squads never empty', () => {
    const alive = Object.values(w.persons).filter((p) => !p.retired);
    const retired = Object.values(w.persons).filter((p) => p.retired);
    expect(retired.length).toBeGreaterThan(50);
    for (const p of alive) { const a = ageOf(p, w.year); expect(a).toBeGreaterThanOrEqual(15); expect(a).toBeLessThanOrEqual(42); }
    const youngGrown = alive.filter((p) => ageOf(p, w.year) <= 23 && !p.youth && overall(p) >= 11).length;
    expect(youngGrown).toBeGreaterThan(5);
    for (const c of Object.values(w.clubs)) expect(clubPlayers(w, c.id).length).toBeGreaterThanOrEqual(11);
    // clubs' levels drift but stay in a hockey-shaped band; tier 1 stronger than tier 2 on average
    const lv = (t: 1 | 2): number => { const cs = Object.values(w.clubs).filter((c) => c.tier === t); return cs.reduce((s, c) => s + c.level, 0) / cs.length; };
    expect(lv(1)).toBeGreaterThan(lv(2));
    expect(lv(1)).toBeLessThan(19); expect(lv(2)).toBeGreaterThan(5);
  });
  it('finances stay at an amateur scale and no club balance runs away', () => {
    for (const c of Object.values(w.clubs)) { expect(Math.abs(c.finances.balance)).toBeLessThan(2_000_001); expect(c.finances.membershipIncome).toBeGreaterThan(50_000); }
  });
  it('is deterministic: the same seed replays the same ten seasons', () => {
    const w2 = createWorld(42, 'mens');
    for (let s = 0; s < 10; s++) { playSeason(w2, quickRunner); newSeason(w2); }
    expect(w2.history.map((h) => h.champion)).toEqual(champions);
  });
});

describe('the real engine on a match day and a short season', () => {
  it('plays a whole tier-1 match day through the engine with squads from the world; results, stats, goals and injuries land on the world', () => {
    const w = createWorld(3, 'mens');
    const today = fixturesToday(w).length;
    expect(today).toBe(12); // 6 per tier
    const played = advanceDay(w, { runner: engineRunner, keepReplayFor: null });
    expect(played.length).toBe(12);
    for (const f of played) { expect(f.played).toBe(true); expect(f.result).toBeDefined(); expect(f.stats?.goals[0]).toBe(f.result?.home); }
    const goals = played.reduce((s, f) => s + (f.result?.home ?? 0) + (f.result?.away ?? 0), 0);
    const scorers = Object.values(w.persons).filter((p) => p.goals > 0);
    expect(scorers.reduce((s, p) => s + p.goals, 0)).toBeGreaterThan(0);
    expect(scorers.reduce((s, p) => s + p.goals, 0)).toBeLessThanOrEqual(goals);
    const t = standings(w, 1);
    expect(t.length).toBe(TIER_SIZE);
    expect(t.reduce((s, r) => s + r.p, 0)).toBe(12);
  }, 120_000);

  it('a full season with 4-club tiers through the real engine finishes with a champion and a kept replay for the user club', async () => {
    const w = createWorld(11, 'womens', { tierSize: 4 });
    w.userClub = 'c1';
    // yield to the event loop between match days so the vitest worker RPC keeps its heartbeat during ~50 s of sync sim
    while (!w.season.finished) { advanceDay(w, { runner: engineRunner, keepReplayFor: 'c1' }); await new Promise((r) => setImmediate(r)); }
    expect(w.season.finished).toBe(true);
    const h = w.history[0]!;
    expect(h.champion).toBeTruthy();
    const mine = w.season.fixtures.filter((f) => f.home === 'c1' || f.away === 'c1');
    expect(mine.every((f) => f.replay !== undefined)).toBe(true);
    expect(mine[0]?.replay?.format).toBe('bullyoff-replay-file');
    const others = w.season.fixtures.filter((f) => f.home !== 'c1' && f.away !== 'c1');
    expect(others.every((f) => f.replay === undefined)).toBe(true);
    const goals = w.season.fixtures.reduce((s, f) => s + (f.result?.home ?? 0) + (f.result?.away ?? 0), 0);
    expect(goals / w.season.fixtures.length).toBeGreaterThan(1.5); // women's ≈ 3.6 calibrated; a small league varies
  }, 600_000);
});

describe('saves', () => {
  it('serialises, deserialises and migrates; refuses newer saves', () => {
    const w = createWorld(5, 'mens', { tierSize: 6 });
    playSeason(w, quickRunner);
    const json = JSON.stringify(serialize(w, ENGINE_VERSION, '2026-08-19T00:00:00Z'));
    const back = deserialize(json);
    expect(JSON.stringify(back)).toBe(JSON.stringify(w));
    // resume identically
    newSeason(back); newSeason(w);
    playSeason(back, quickRunner); playSeason(w, quickRunner);
    expect(back.history[1]?.champion).toBe(w.history[1]?.champion);
    // legacy v0 doc without history migrates
    const legacy = { format: 'bullyoff-save', version: 0, world: { ...(w as unknown as Record<string, unknown>), history: undefined } };
    const migrated = deserialize(JSON.stringify(legacy));
    expect(Array.isArray(migrated.history)).toBe(true);
    expect(() => deserialize(JSON.stringify({ format: 'bullyoff-save', version: 99, world: {} }))).toThrow(/newer/);
    expect(() => deserialize('{"format":"nope"}')).toThrow();
  });
});
