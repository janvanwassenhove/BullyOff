/**
 * Phase 8 gate (worldgen half): no generated club name matches the real-club blocklist;
 * name pools are gendered and nationality-weighted; identities are distinct and deterministic.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '@bullyoff/shared';
import { PACKAGE_NAME, REAL_CLUBS, isBlocked, blockedBy, normaliseName, generateClubIdentities, generatePersonName, generateTown, FIRST_M, FIRST_W, nationalityTable } from './index.js';

describe('@bullyoff/worldgen', () => {
  it('is wired into the workspace', () => { expect(PACKAGE_NAME).toBe('@bullyoff/worldgen'); });
});

describe('real-club blocklist (ADR-006)', () => {
  it('normalises case, diacritics and punctuation', () => {
    expect(normaliseName('Royal Léopold Club')).toEqual(['royal', 'leopold', 'club']);
    expect(normaliseName("KHC 's-Hertogenbosch!")).toEqual(['khc', 's', 'hertogenbosch']);
  });
  it('blocks every real club in the list, in any casing/spelling, and close compounds', () => {
    for (const c of REAL_CLUBS) expect(isBlocked(c), c).toBe(true);
    expect(isBlocked('waterloo ducks')).toBe(true);
    expect(isBlocked('HC Gantoise')).toBe(true);
    expect(isBlocked('Kampongveld HC')).toBe(true);
    expect(blockedBy('Royal Uccle Hockey')).toBe('uccle');
    expect(isBlocked('Dragons Hockey')).toBe(true);
    expect(isBlocked('Braxgata')).toBe(true);
  });
  it('does not block plainly generic names', () => {
    expect(isBlocked('HC Berkendael')).toBe(false);
    expect(isBlocked('Royal Zavelberg Hockey Club')).toBe(false);
    expect(isBlocked('Koninklijke Molenhoek HC')).toBe(false);
  });
  it('every identity a world generator can produce passes the blocklist — 2000 clubs over many seeds', () => {
    let total = 0, rerolls = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = generateClubIdentities(new Rng(seed, 77), 50, (['mixed', 'vlaanderen', 'wallonie', 'bruxelles'] as const)[seed % 4]);
      rerolls += r.rerolls;
      for (const c of r.clubs) { expect(isBlocked(c.name), c.name).toBe(false); expect(isBlocked(c.town), c.town).toBe(false); total++; }
      expect(new Set(r.clubs.map((c) => c.town)).size).toBe(50);
      expect(new Set(r.clubs.map((c) => c.short)).size).toBe(50);
    }
    expect(total).toBe(2000);
    // the blocklist does bite sometimes (a generated "Waterheide" shares no token with Waterloo, but "Mol…" compounds etc. may) — just make sure generation stays cheap
    expect(rerolls).toBeLessThan(total);
  });
  it('towns are compounds, not real places we list; generated names are deterministic per seed', () => {
    const a = generateClubIdentities(new Rng(9, 77), 24), b = generateClubIdentities(new Rng(9, 77), 24);
    expect(a.clubs.map((c) => c.name)).toEqual(b.clubs.map((c) => c.name));
    // raw towns occasionally share a token with a real club's town ("-la-Neuve"); the identity generator re-rolls those — keep the raw hit rate small
    let hits = 0;
    for (let i = 0; i < 200; i++) { const t = generateTown(new Rng(i, 1), i % 2 ? 'nl' : 'fr'); expect(t.length).toBeGreaterThan(4); if (isBlocked(t)) hits++; }
    expect(hits).toBeLessThan(30);
  });
});

describe('name pools', () => {
  it('first names are gendered per language and never shared across the two pools of a language', () => {
    for (const lang of ['nl', 'fr', 'en', 'de', 'es', 'it', 'in'] as const) {
      const m = new Set(FIRST_M[lang]);
      for (const w of FIRST_W[lang]) expect(m.has(w), `${lang}:${w}`).toBe(false);
      expect(FIRST_M[lang].length).toBeGreaterThan(10); expect(FIRST_W[lang].length).toBeGreaterThan(10);
    }
  });
  it('nationalities are weighted: a Belgian club world is mostly Belgian with a Dutch/French sprinkle; flavour shifts nl/fr', () => {
    const rng = new Rng(3, 5);
    const count: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) { const n = generatePersonName(rng, 'w', 'mixed'); count[n.nationality] = (count[n.nationality] ?? 0) + 1; }
    expect((count['BEL'] ?? 0) / 4000).toBeGreaterThan(0.75);
    expect((count['NED'] ?? 0) / 4000).toBeGreaterThan(0.02);
    const t = nationalityTable('wallonie');
    const nl = t.find((r) => r.nat === 'BEL' && r.lang === 'nl')?.w ?? 0, fr = t.find((r) => r.nat === 'BEL' && r.lang === 'fr')?.w ?? 0;
    expect(fr).toBeGreaterThan(nl * 3);
    const women = Array.from({ length: 50 }, () => generatePersonName(rng, 'w', 'vlaanderen').first);
    for (const f of women) expect(FIRST_M.nl.includes(f) && !FIRST_W.nl.includes(f)).toBe(false);
  });
});
