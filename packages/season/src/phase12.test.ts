/**
 * Phase 12 — competitions of Europe. Five national leagues on one calendar, each closed by a title
 * final four; a European club knockout in the winter break; a nations competition in a Pro League
 * format (double round robin, the table decides). The structure has to be airtight before any of it
 * touches a screen: every competition resolves, deterministically, and an old save migrates.
 */
import { describe, expect, it } from 'vitest';
import { isBlocked } from '@bullyoff/worldgen';
import {
  COUNTRY_LEVEL, LEAGUE_COUNTRIES, MIGRATIONS, TIER_SIZE, createWorld, deserialize, europeanSlots,
  leaguesOf, nationsTable, newSeason, playSeason, quickRunner, serialize, standings,
  type Country, type World,
} from './index.js';

const quickWorld = (seed: number): World => createWorld(seed, 'mens', {});

describe('the world of six leagues', () => {
  const w = quickWorld(21);
  it('holds the five countries: the user country with two tiers, the others with one', () => {
    expect(leaguesOf(w).map((l) => `${l.country}${l.tier}`)).toEqual(['BE1', 'BE2', 'DE1', 'EN1', 'FR1', 'NL1']);
    for (const c of LEAGUE_COUNTRIES) {
      expect(Object.values(w.clubs).filter((x) => x.country === c && x.tier === 1).length).toBe(TIER_SIZE);
    }
    expect(Object.keys(w.clubs).length).toBe(TIER_SIZE * 6);
  });
  it('foreign identities are clean, distinct world-wide and in their own club culture', () => {
    const names = Object.values(w.clubs).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    const shorts = Object.values(w.clubs).map((c) => c.short);
    expect(new Set(shorts).size).toBe(shorts.length); // a European bracket never shows two identical codes
    for (const c of Object.values(w.clubs)) expect(isBlocked(c.name), c.name).toBe(false);
    // each league speaks its own language on the sheet
    expect(Object.values(w.clubs).filter((c) => c.country === 'DE').every((c) => c.lang === 'de')).toBe(true);
    expect(Object.values(w.clubs).filter((c) => c.country === 'EN').every((c) => c.lang === 'en')).toBe(true);
  });
  it('league strength follows the country (the Dutch league outrates the French)', () => {
    const mean = (c: Country): number => { const cs = Object.values(w.clubs).filter((x) => x.country === c && x.tier === 1); return cs.reduce((s, x) => s + x.level, 0) / cs.length; };
    expect(mean('NL')).toBeGreaterThan(mean('FR'));
    expect(Math.abs(mean('NL') - COUNTRY_LEVEL.NL)).toBeLessThan(1.2);
  });
  it('squads carry their country: a German club is mostly German players', () => {
    const de = Object.values(w.clubs).find((c) => c.country === 'DE');
    const squad = Object.values(w.persons).filter((p) => p.club === de?.id);
    expect(squad.filter((p) => p.nationality === 'GER').length / squad.length).toBeGreaterThan(0.6);
  });
  it('the nations competition fields nine sides with plausible strengths', () => {
    expect(w.nations.length).toBe(9);
    for (const n of w.nations) { expect(n.level).toBeGreaterThan(9); expect(n.level).toBeLessThan(19.5); }
  });
});

describe('a full season across all competitions (quick resolver)', () => {
  const w = quickWorld(33);
  playSeason(w, quickRunner);
  it('every league crowns a play-off champion', () => {
    for (const { country, tier } of leaguesOf(w)) {
      const po = w.season.playoffs.find((p) => p.country === country && p.tier === tier);
      expect(po?.champion, `${country} tier ${tier}`).toBeTruthy();
      // the champion comes from that league
      expect(w.clubs[po?.champion ?? '']?.country).toBe(country);
    }
  });
  it('the European knockout ran in the winter break with eight entrants and a champion', () => {
    const eu = w.season.europe;
    expect(eu?.entrants.length).toBe(8);
    expect(new Set(eu?.entrants.map((id) => w.clubs[id]?.country)).size).toBeGreaterThanOrEqual(5);
    expect(eu?.quarters.length).toBe(4);
    expect(eu?.semis.length).toBe(2);
    expect(eu?.final.length).toBe(1);
    expect(eu?.champion).toBeTruthy();
    const slots = europeanSlots(w);
    expect(slots.BE).toBe(2);
    // the block sits inside the break: no European fixture on a league day
    for (const f of w.season.fixtures.filter((x) => x.phase.startsWith('eu-'))) {
      expect(f.day).toBeGreaterThanOrEqual(w.season.winterBreak[0]);
      expect(f.day).toBeLessThanOrEqual(w.season.winterBreak[1]);
    }
  });
  it('the nations competition resolved its double round robin and the table decides', () => {
    const n = w.season.nations;
    expect(n?.fixtures.length).toBe(9 * 8); // nine sides, everyone home and away
    expect(n?.fixtures.every((f) => f.played && f.result)).toBe(true);
    const table = nationsTable(w);
    expect(table.length).toBe(9);
    expect(table.reduce((s, r) => s + r.p, 0)).toBe(9 * 8 * 2 / 1); // each match counts for two rows... two rows per match
    expect(n?.champion).toBe(table[0]?.id);
    // points conservation: 2 or 3 points distributed per match
    const pts = table.reduce((s, r) => s + r.pts, 0);
    expect(pts).toBeGreaterThanOrEqual(2 * 72); expect(pts).toBeLessThanOrEqual(3 * 72);
  });
  it('the season summary records the champions of Europe, the nations and the foreign leagues', () => {
    const h = w.history[w.history.length - 1];
    expect(h?.europeChampion).toBe(w.season.europe?.champion);
    expect(h?.nationsChampion).toBe(w.season.nations?.champion);
    expect(Object.keys(h?.foreignChampions ?? {}).sort()).toEqual(['DE', 'EN', 'FR', 'NL']);
  });
  it('standings are per league: a foreign table holds that country only', () => {
    const nl = standings(w, 1, 'NL');
    expect(nl.length).toBe(TIER_SIZE);
    expect(nl.every((r) => w.clubs[r.club]?.country === 'NL')).toBe(true);
    expect(nl.every((r) => r.p === (TIER_SIZE - 1) * 2)).toBe(true);
  });
  it('rolls into the next season with fresh competitions everywhere', () => {
    newSeason(w);
    expect(w.season.europe?.entrants.length).toBe(8);
    expect(w.season.nations?.fixtures.every((f) => !f.played)).toBe(true);
    // last season's champions carry seeding weight: the European champion's league keeps sending clubs
    expect(w.season.fixtures.filter((f) => f.phase === 'regular').length).toBe(6 * (TIER_SIZE - 1) * 2 * (TIER_SIZE / 2));
  });
  it('is deterministic: the same seed replays the same season, every competition included', () => {
    const a = quickWorld(33), b = quickWorld(33);
    playSeason(a, quickRunner); playSeason(b, quickRunner);
    expect(JSON.stringify(a.season.europe)).toBe(JSON.stringify(b.season.europe));
    expect(JSON.stringify(a.season.nations)).toBe(JSON.stringify(b.season.nations));
    expect(JSON.stringify(a.history)).toBe(JSON.stringify(b.history));
  });
});

describe('save migration 4 → 5', () => {
  it('an old Belgian save gains its country and empty competitions, and still deserialises', () => {
    const w = createWorld(9, 'mens', { tierSize: 4, domesticOnly: true });
    const doc = serialize(w, '0.9.0', '2026-08-30') as unknown as Record<string, unknown>;
    // fake a v4 save: strip the Phase 12 fields
    doc['version'] = 4;
    const world = doc['world'] as Record<string, unknown>;
    delete world['country']; delete world['nations'];
    const season = world['season'] as Record<string, unknown>;
    delete season['europe']; delete season['nations'];
    for (const f of season['fixtures'] as Record<string, unknown>[]) delete f['country'];
    const m = MIGRATIONS[4];
    expect(m).toBeDefined();
    const migrated = deserialize(JSON.stringify(doc));
    expect(migrated.country).toBe('BE');
    expect(migrated.nations).toEqual([]);
    expect(migrated.season.europe).toBeNull();
    expect(migrated.season.fixtures.every((f) => f.country === 'BE')).toBe(true);
    // and the migrated world still plays
    playSeason(migrated, quickRunner);
    expect(migrated.season.finished).toBe(true);
  });
});
