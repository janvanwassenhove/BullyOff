/**
 * Handedness (§6). Every stick is right-handed: the open stick is the player's right, the reverse
 * their left. These tests pin the *direction and the ordering* of every consequence — a coach's
 * claims, not magic numbers (CLAUDE.md rule 8).
 */
import { describe, expect, it } from 'vitest';
import { dmath } from '@bullyoff/shared';
import { attributesFor } from './attributes.js';
import {
  carrySideFactor, lateralOf, lateralOfDir, openStickDir, openness, receiveSideFactor,
  reverseness, strikeSideError, strikeSideSpeed, tackleSideOdds,
} from './handedness.js';

const good = attributesFor('MID', 19);
const weak = attributesFor('MID', 3);
const at = { x: 0, y: 0 };

describe('which side is which', () => {
  it('a player facing +x has their open stick to −y and their reverse to +y', () => {
    // the right hand of someone facing east points south: −y in a centre-origin pitch frame
    expect(lateralOf(0, at, { x: 0, y: -5 })).toBeCloseTo(-1, 6); // open stick
    expect(lateralOf(0, at, { x: 0, y: 5 })).toBeCloseTo(1, 6);   // reverse
    expect(lateralOf(0, at, { x: 5, y: 0 })).toBeCloseTo(0, 6);   // straight ahead: neither
    expect(lateralOf(0, at, { x: -5, y: 0 })).toBeCloseTo(0, 6);  // straight behind: neither
  });

  it('turns with the player, not with the pitch', () => {
    // the same point is on the forehand or the backhand depending on which way he is facing
    const point = { x: 0, y: 5 };
    expect(lateralOf(0, at, point)).toBeGreaterThan(0.9);            // facing east: reverse
    expect(lateralOf(dmath.PI, at, point)).toBeLessThan(-0.9);       // facing west: open stick
  });

  it('is a gradient, not a flag: half a metre off the front foot is barely a reverse ball', () => {
    const slight = lateralOf(0, at, { x: 5, y: 0.5 });
    expect(slight).toBeGreaterThan(0);
    expect(slight).toBeLessThan(0.2);
    expect(reverseness(slight)).toBe(slight);
    expect(reverseness(-slight)).toBe(0); // nothing on the open side is a reverse ball
    expect(openness(-slight)).toBe(slight);
  });

  it('openStickDir points at the player\'s right hand and is a unit vector', () => {
    const d = openStickDir(0);
    expect(d.x).toBeCloseTo(0, 6); expect(d.y).toBeCloseTo(-1, 6);
    for (const h of [0, 0.7, 1.9, -2.4]) {
      const v = openStickDir(h);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
      // standing there means standing on the carrier's open stick side
      expect(lateralOf(h, at, v)).toBeLessThan(-0.99);
    }
  });

  it('a direction reads the same as a point in that direction', () => {
    expect(lateralOfDir(0, dmath.PI / 2)).toBeCloseTo(lateralOf(0, at, { x: 0, y: 5 }), 6);
  });
});

describe('the reverse costs you (§6.3–6.5)', () => {
  it('a ball on the reverse is harder to receive than the same ball on the forehand', () => {
    expect(receiveSideFactor(good, 1)).toBeLessThan(receiveSideFactor(good, -1));
    expect(receiveSideFactor(good, -1)).toBe(1);       // the forehand is free
    expect(receiveSideFactor(good, 0)).toBe(1);        // straight at him is free
  });

  it('good hands pay less than weak ones — but the reverse is awkward for everybody', () => {
    expect(receiveSideFactor(good, 1)).toBeGreaterThan(receiveSideFactor(weak, 1));
    const goodPays = 1 - receiveSideFactor(good, 1), weakPays = 1 - receiveSideFactor(weak, 1);
    expect(weakPays).toBeGreaterThan(1.2 * goodPays);
    // …and not so much less that class compounds: an international still loses control on his
    // backhand, he is simply better at not being put there.
    expect(goodPays).toBeGreaterThan(0.5 * weakPays);
  });

  it('the reverse hit is the weak one; a push barely notices', () => {
    const hitLoss = 1 - strikeSideSpeed(good, 'hit', 1);
    const pushLoss = 1 - strikeSideSpeed(good, 'push', 1);
    expect(hitLoss).toBeGreaterThan(pushLoss);
    expect(pushLoss).toBeGreaterThan(0);
    expect(strikeSideSpeed(good, 'hit', -1)).toBe(1); // nothing is lost on the forehand
  });

  it('the reverse also sprays wider, and worst for a hit', () => {
    expect(strikeSideError(good, 'hit', 1)).toBeGreaterThan(strikeSideError(good, 'push', 1));
    expect(strikeSideError(good, 'push', 1)).toBeGreaterThan(1);
    expect(strikeSideError(good, 'hit', -1)).toBe(1);
    // a technician's reverse is tidier than a novice's
    expect(strikeSideError(good, 'hit', 1)).toBeLessThan(strikeSideError(weak, 'hit', 1));
  });

  it('carrying and eliminating on the reverse is harder, and eliminators pay least', () => {
    expect(carrySideFactor(good, 1)).toBeLessThan(1);
    expect(carrySideFactor(good, -1)).toBe(1);
    const eliminator = attributesFor('FWD', 19);
    expect(carrySideFactor(eliminator, 1)).toBeGreaterThan(carrySideFactor(weak, 1));
  });
});

describe('the tackle side (§6.2)', () => {
  const base = { win: 0.35, foulTackler: 0.08 };
  const open = tackleSideOdds(base, good, -1);   // standing on the carrier's forehand shoulder
  const across = tackleSideOdds(base, good, 1);  // reaching through the man from his reverse side

  it('from the open stick side the tackle succeeds more and fouls less', () => {
    expect(open.win).toBeGreaterThan(across.win);
    expect(open.foulTackler).toBeLessThan(across.foulTackler);
    expect(open.win).toBeGreaterThan(base.win);
    expect(open.foulTackler).toBeLessThan(base.foulTackler);
  });

  it('across the body the carrier also gets the shield call more often', () => {
    expect(across.shield).toBeGreaterThan(open.shield);
  });

  it('a hot-headed, undisciplined tackler reaches through more than a disciplined one', () => {
    const hot = attributesFor('DEF', 12); hot.mental.aggression = 19; hot.mental.discipline = 3;
    const cool = attributesFor('DEF', 12); cool.mental.aggression = 5; cool.mental.discipline = 19;
    expect(tackleSideOdds(base, hot, 1).foulTackler).toBeGreaterThan(tackleSideOdds(base, cool, 1).foulTackler);
    // …and the side is what creates the gap: on the clean side they are much closer together
    const gapAcross = tackleSideOdds(base, hot, 1).foulTackler - tackleSideOdds(base, cool, 1).foulTackler;
    const gapOpen = tackleSideOdds(base, hot, -1).foulTackler - tackleSideOdds(base, cool, -1).foulTackler;
    expect(gapAcross).toBeGreaterThan(gapOpen);
  });

  it('every returned probability stays a probability', () => {
    for (const lat of [-1, -0.4, 0, 0.4, 1]) {
      for (const a of [good, weak]) {
        const o = tackleSideOdds({ win: 0.8, foulTackler: 0.3 }, a, lat);
        for (const v of [o.win, o.foulTackler, o.shield]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
        expect(o.win + o.foulTackler).toBeLessThan(1);
      }
    }
  });
});
