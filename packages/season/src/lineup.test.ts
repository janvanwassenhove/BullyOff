/**
 * The coach picks the team sheet (Phase 10.2). Two things have to stay true: a club that has not
 * picked one still gets the assistant's eleven exactly as before, and a club that has picked one
 * gets its men — except those who cannot play on Saturday, who are replaced and reported rather
 * than silently dropped.
 */
import { describe, expect, it } from 'vitest';
import { createWorld } from './world.js';
import { availableFor, fixtureSetup, selectSquad, squadSeed, teamSheet } from './matchday.js';
import { fixturesToday } from './season.js';
import { deserialize, serialize, SAVE_VERSION } from './save.js';
import type { World } from './model.js';

const world = (): World => createWorld(11, 'mens', { domesticOnly: true });
/** The first fixture of the season, and the home club's seed for it. */
const firstFixture = (w: World): { f: ReturnType<typeof fixturesToday>[number]; club: string } => {
  const f = fixturesToday(w)[0];
  if (!f) throw new Error('no fixture on day 0');
  return { f, club: f.home };
};

describe('team sheet', () => {
  it('no sheet: the assistant picks eleven in formation order with a keeper first, and up to five subs', () => {
    const w = world();
    const { f, club } = firstFixture(w);
    const { starters, bench } = selectSquad(w, club, squadSeed(f, club));
    expect(starters.length).toBe(11);
    expect(starters[0]?.role).toBe('GK');
    expect(bench.length).toBeLessThanOrEqual(5);
    expect(new Set(starters.map((p) => p.id)).size).toBe(11); // nobody twice
  });

  it('a picked sheet is honoured man for man, and the bench is the coach\'s bench', () => {
    const w = world();
    const { f, club } = firstFixture(w);
    const seed = squadSeed(f, club);
    const fit = availableFor(w, club, seed);
    const gk = fit.find((p) => p.role === 'GK');
    const outfield = fit.filter((p) => p.role !== 'GK');
    if (!gk || outfield.length < 15) throw new Error('squad too thin for the test');
    // deliberately not the assistant's choice: take the *weakest* available outfielders
    const picked = [gk, ...outfield.slice(-10)];
    const benched = outfield.slice(-13, -10);
    const c = w.clubs[club];
    if (!c) throw new Error('no club');
    c.lineup = { starters: picked.map((p) => p.id), bench: benched.map((p) => p.id) };

    const { starters, bench } = selectSquad(w, club, seed);
    expect(starters.map((p) => p.id)).toEqual(picked.map((p) => p.id));
    expect(bench.slice(0, 3).map((p) => p.id)).toEqual(benched.map((p) => p.id));
    expect(teamSheet(w, f, club).missing).toEqual([]);
  });

  it('a man who cannot play is replaced, and the sheet says who is missing', () => {
    const w = world();
    const { f, club } = firstFixture(w);
    const seed = squadSeed(f, club);
    const fit = availableFor(w, club, seed);
    const gk = fit.find((p) => p.role === 'GK');
    const outfield = fit.filter((p) => p.role !== 'GK');
    if (!gk || outfield.length < 12) throw new Error('squad too thin for the test');
    const picked = [gk, ...outfield.slice(0, 10)];
    const c = w.clubs[club];
    if (!c) throw new Error('no club');
    c.lineup = { starters: picked.map((p) => p.id), bench: [] };

    // Saturday morning: the right back turns an ankle
    const hurt = picked[3];
    if (!hurt) throw new Error('no player in slot 3');
    hurt.injuredDays = 9;

    const sheet = teamSheet(w, f, club);
    expect(sheet.starters.length).toBe(11);
    expect(sheet.starters.map((p) => p.id)).not.toContain(hurt.id);
    expect(sheet.missing.map((p) => p.id)).toEqual([hurt.id]);
    // the other ten are still the coach's men
    for (const p of picked.filter((x) => x.id !== hurt.id)) expect(sheet.starters.map((x) => x.id)).toContain(p.id);
  });
});

describe('penalty-corner battery', () => {
  it('a battery picked as people reaches the engine as on-pitch ids; a man who did not make the eleven drops out', () => {
    const w = world();
    const { f, club } = firstFixture(w);
    const { starters } = selectSquad(w, club, squadSeed(f, club));
    const striker = starters[9], trapper = starters[6];
    const reserve = availableFor(w, club, squadSeed(f, club)).find((p) => !starters.some((s) => s.id === p.id));
    if (!striker || !trapper || !reserve) throw new Error('squad too thin for the test');
    const c = w.clubs[club];
    if (!c) throw new Error('no club');
    c.pcBattery = { injector: reserve.id, trapper: trapper.id, striker: striker.id };

    const { tactics, idMap } = fixtureSetup(w, f, false);
    const battery = tactics[0].pcBattery;
    expect(battery).toBeDefined();
    expect(idMap.get(battery?.striker ?? -1)).toBe(striker.id);
    expect(idMap.get(battery?.trapper ?? -1)).toBe(trapper.id);
    expect(battery?.injector).toBeUndefined(); // not in the eleven or on the bench: the AI takes that role
  });

  it('no battery picked: the tactics go through untouched', () => {
    const w = world();
    const { f } = firstFixture(w);
    expect(fixtureSetup(w, f, false).tactics[0].pcBattery).toBeUndefined();
  });
});

describe('save format', () => {
  it('a version 3 save loads: clubs without a team sheet get the assistant\'s pick', () => {
    const w = world();
    const doc = serialize(w, '0.0.0', '2026-01-01T00:00:00.000Z') as unknown as Record<string, unknown>;
    const older: Record<string, unknown> = { ...doc, version: 3 };
    const clubs = (older['world'] as { clubs: Record<string, Record<string, unknown>> }).clubs;
    for (const c of Object.values(clubs)) { delete c['lineup']; delete c['pcBattery']; delete c['captain']; }
    const back = deserialize(older as unknown as Parameters<typeof deserialize>[0]);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(4);
    for (const c of Object.values(back.clubs)) {
      expect(c.lineup).toBeNull();
      expect(c.pcBattery).toBeNull();
      expect(c.captain).toBeNull();
    }
  });
});
