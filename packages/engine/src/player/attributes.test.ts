import { describe, expect, it } from 'vitest';
import {
  accelFactor, attributesFor, gkReach, gkSaveChance, paceFactor, staminaDrainFactor, strikeErrorSd, strikeSpeedFactor,
  tackleOdds, trapSuccess,
} from './attributes.js';

const lo = attributesFor('MID', 4), mid = attributesFor('MID', 12), hi = attributesFor('MID', 20);

describe('attribute → parameter mappings (each has an effect, monotone in the attribute)', () => {
  it('strike speed: a 20 hits at the profile max, a low rating well below', () => {
    expect(strikeSpeedFactor(hi, 'hit')).toBeCloseTo(1, 6);
    expect(strikeSpeedFactor(lo, 'hit')).toBeLessThan(strikeSpeedFactor(mid, 'hit'));
    expect(strikeSpeedFactor(mid, 'hit')).toBeLessThan(strikeSpeedFactor(hi, 'hit'));
    expect(strikeSpeedFactor(lo, 'hit')).toBeGreaterThan(0.5);
  });
  it('strike error: better players spray less; fatigue widens it', () => {
    expect(strikeErrorSd(hi, 'hit', 1)).toBeLessThan(strikeErrorSd(lo, 'hit', 1));
    expect(strikeErrorSd(hi, 'hit', 1)).toBeLessThan(0.05); // < 3°
    expect(strikeErrorSd(lo, 'hit', 1)).toBeGreaterThan(0.1); // > 6°
    expect(strikeErrorSd(mid, 'hit', 0.2)).toBeGreaterThan(strikeErrorSd(mid, 'hit', 1));
  });
  it('trap success: better trapping, slower balls and grounded balls are safer', () => {
    expect(trapSuccess(hi, 6, 0)).toBeGreaterThan(trapSuccess(lo, 6, 0));
    expect(trapSuccess(mid, 6, 0)).toBeGreaterThan(trapSuccess(mid, 30, 0));
    expect(trapSuccess(mid, 6, 0)).toBeGreaterThan(trapSuccess(mid, 6, 0.4));
    expect(trapSuccess(hi, 6, 0)).toBeGreaterThan(0.9);
  });
  it('pace/accel/stamina factors: 20 = profile, 1 = 75 %; better stamina drains slower', () => {
    expect(paceFactor(hi)).toBeCloseTo(1, 6);
    expect(paceFactor(attributesFor('MID', 1))).toBeCloseTo(0.75, 6);
    expect(accelFactor(lo)).toBeLessThan(accelFactor(hi));
    expect(staminaDrainFactor(hi)).toBeLessThan(staminaDrainFactor(lo));
  });
  it('tackles: a better tackler wins more; aggressive, undisciplined tacklers foul more', () => {
    const def = attributesFor('DEF', 16), fwd = attributesFor('FWD', 8);
    expect(tackleOdds(def, fwd).win).toBeGreaterThan(tackleOdds(fwd, def).win);
    const hot = attributesFor('DEF', 12); hot.mental.aggression = 20; hot.mental.discipline = 2;
    const cool = attributesFor('DEF', 12); cool.mental.aggression = 2; cool.mental.discipline = 20;
    expect(tackleOdds(hot, mid).foulTackler).toBeGreaterThan(tackleOdds(cool, mid).foulTackler);
    const o = tackleOdds(mid, mid); expect(o.win + o.foulTackler).toBeLessThan(1);
  });
  it('goalkeeper: reach and save chance rise with reflexes; hard, wide shots are harder', () => {
    const gkLo = attributesFor('GK', 6), gkHi = attributesFor('GK', 18);
    expect(gkReach(gkHi)).toBeGreaterThan(gkReach(gkLo));
    expect(gkSaveChance(gkHi, 20, 0.5)).toBeGreaterThan(gkSaveChance(gkLo, 20, 0.5));
    expect(gkSaveChance(gkHi, 20, 0.2)).toBeGreaterThan(gkSaveChance(gkHi, 34, 0.2));
    expect(gkSaveChance(gkHi, 20, 0.2)).toBeGreaterThan(gkSaveChance(gkHi, 20, 1.6));
  });
  it('role emphasis: forwards flick better than defenders, defenders tackle better than forwards; only GKs have GK attributes', () => {
    expect(attributesFor('FWD').technical.dragFlick).toBeGreaterThan(attributesFor('DEF').technical.dragFlick);
    expect(attributesFor('DEF').technical.tackling).toBeGreaterThan(attributesFor('FWD').technical.tackling);
    expect(attributesFor('GK').goalkeeper.reflexes).toBeGreaterThan(attributesFor('MID').goalkeeper.reflexes);
  });
});
