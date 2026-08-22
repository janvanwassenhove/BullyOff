/**
 * The analyser is a pure function of the log: same log ⇒ same findings; findings
 * carry keys and numbers only; live reads only look at the window asked for.
 */
import { describe, expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { createAi, getProfile, simulateMatch, squadsFromSetup, type CoachInstruction } from '@bullyoff/engine';
import { aiMatchSetup } from '@bullyoff/engine/fixtures';
import { createWorld } from '@bullyoff/season';
import { adviseSeason, analyse, attributeRows, matchSheet, momentum, playerRead, ruleFor } from './index.js';

function coachedMatch(seed: number, ins: readonly CoachInstruction[]) {
  const setup = aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST, 12); setup.frameEvery = 20;
  const ai = createAi(seed, squadsFromSetup(setup.players), { profile: getProfile('mens'), surface: 'watered' });
  ai.instruct(ins);
  return simulateMatch(setup, seed, ai.controller);
}

describe('analyse', () => {
  const ins: CoachInstruction[] = [{ tick: 20 * 60 * 20, team: 0, kind: 'tactics', patch: { buildUp: 'wide' } }];
  const log = coachedMatch(7, ins);

  it('is deterministic and never renders text: every finding is a key + params + numbers', () => {
    const a = analyse(log, ins, 0), b = analyse(log, ins, 0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(0);
    for (const f of a) {
      expect(f.i18nKey).toMatch(/^insight\./);
      expect(typeof f.tick).toBe('number');
      for (const v of Object.values(f.metrics)) expect(typeof v).toBe('number');
    }
  });
  it('produces a key moment for every goal, a rule of the match when fouls repeat, and a phase reading', () => {
    const a = analyse(log, ins, 0);
    const goals = log.events.filter((e) => e.t === 'Goal').length;
    expect(a.filter((f) => f.kind === 'goal').length).toBe(goals);
    const fouls = log.events.filter((e) => e.t === 'Foul').length;
    if (fouls >= 2) { const r = a.find((f) => f.section === 'rule'); expect(r?.ruleKey).toMatch(/^rules\./); }
    expect(a.some((f) => f.section === 'phase')).toBe(true);
    // goals against carry the reason when we fouled just before
    for (const g of a.filter((f) => f.kind === 'goal' && f.severity === 'mistake')) expect(['insight.momentConceded', 'insight.momentConcededFoul', 'insight.momentConcededTackle', 'insight.momentConcededPc']).toContain(g.i18nKey);
  });
  it('the live read only uses events up to the tick asked for and is reproducible', () => {
    const t = 20 * 60 * 30;
    const live = analyse(log, ins, 0, { upToTick: t });
    expect(live.every((f) => f.tick <= t)).toBe(true);
    expect(JSON.stringify(live)).toBe(JSON.stringify(analyse(log, ins, 0, { upToTick: t })));
  });
  it('momentum buckets and the match sheet are derived from the log and add up', () => {
    const m = momentum(log, 0);
    expect(m.length).toBe(16);
    const sheet = matchSheet(log, 0);
    const goals = sheet.find((r) => r.key === 'goals');
    expect(goals?.usN).toBe(log.events.filter((e) => e.t === 'Goal' && e.team === 0).length);
    expect(goals?.themN).toBe(log.events.filter((e) => e.t === 'Goal' && e.team === 1).length);
    const poss = sheet.find((r) => r.key === 'possession');
    expect(poss?.usN ?? 0).toBeGreaterThan(0);
    expect((poss?.usN ?? 0) + (poss?.themN ?? 0)).toBe(100);
    expect(m.reduce((s, b) => s + b.us, 0)).toBe(sheet.find((r) => r.key === 'circleEntries')?.usN);
  });
  it('maps every foul kind to a rule key', () => {
    for (const f of ['feet', 'dangerous', 'backStick', 'obstruction', 'stickTackle', 'freeHitDistance', 'freeHit23Circle', 'pcBreach', 'pcHighFirstHit', 'earlyStroke'] as const) expect(ruleFor(f)).toMatch(/^rules\./);
  });
});

describe('season advice', () => {
  const w = createWorld(11, 'mens', { tierSize: 6, historyYears: 2 });
  w.userClub = 'c1';
  it('gives at most three advisories, each a key with params, deterministic', () => {
    const a = adviseSeason(w, 'c1'), b = adviseSeason(w, 'c1');
    expect(a.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const x of a) expect(x.i18nKey).toMatch(/^advice\./);
  });
  it('reads every player into a role-specific note with attribute rows on a 0–100 scale', () => {
    for (const p of Object.values(w.persons).slice(0, 60)) {
      const r = playerRead(p);
      expect(r.i18nKey).toMatch(/^read\./);
      const rows = attributeRows(p);
      expect(rows.length).toBeGreaterThanOrEqual(6);
      for (const row of rows) { expect(row.value).toBeGreaterThanOrEqual(5); expect(row.value).toBeLessThanOrEqual(100); }
    }
  });
});
