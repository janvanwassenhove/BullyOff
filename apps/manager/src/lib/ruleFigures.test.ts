/**
 * The rule scenes make hockey claims — the ball was above the knee, the rounded side played it, the
 * shot crossed above the backboard. If a scene is re-authored and the claim stops being true, the
 * picture teaches the wrong rule. These tests hold the claims, not the coordinates.
 */
import { describe, expect, it } from 'vitest';
import { RULE_KEYS } from '@bullyoff/insight';
import { ruleClip } from './ruleClips';
import { ruleVideo, videoUrl } from './ruleVideos';
import { BACKBOARD_Z, FIGURE_RULES, GOAL_Z, KNEE_Z, ballAt, figureScene, poseOf, sampleScene, type FigureScene } from './ruleFigures';

const scene = (k: string): FigureScene => {
  const s = figureScene(k as (typeof RULE_KEYS)[number]);
  if (!s) throw new Error(`${k} has no figure scene`);
  return s;
};
/** The x of a figure by index at time t. */
const at = (s: FigureScene, i: number, t: number): number => sampleScene(s, t).figures[i]?.x ?? NaN;

describe('every rule is shown somehow', () => {
  it('every rule plays on the pitch, and the ones a pitch cannot show also have a side-elevation scene to switch to', () => {
    for (const k of RULE_KEYS) {
      expect(() => ruleClip(k), k).not.toThrow();
      if (figureScene(k)) expect(FIGURE_RULES).toContain(k);
    }
    expect(FIGURE_RULES.length).toBeGreaterThanOrEqual(9);
  });

  it('scenes are authored inside their own frame: the ball stays on the pitch strip and above the ground, and the whistle falls within the scene', () => {
    for (const k of FIGURE_RULES) {
      const s = scene(k);
      for (let t = 0; t <= s.seconds; t += 0.1) {
        const b = ballAt(s, t);
        expect(b.z, `${k} ball height`).toBeGreaterThanOrEqual(0);
        expect(b.z, `${k} ball height`).toBeLessThanOrEqual(s.height);
        expect(b.x, `${k} ball x`).toBeGreaterThanOrEqual(0);
        expect(b.x, `${k} ball x`).toBeLessThanOrEqual(s.width);
      }
      if (s.verdict) expect(s.verdict.t, `${k} whistle`).toBeLessThanOrEqual(s.seconds);
    }
  });

  it('sampling is clamped: before the start and after the end the scene holds its first and last frame', () => {
    const s = scene('rules.backStick');
    expect(sampleScene(s, -5)).toEqual(sampleScene(s, 0));
    expect(sampleScene(s, s.seconds + 5)).toEqual(sampleScene(s, s.seconds));
  });
});

describe('the scenes say what the rules say', () => {
  it('back-stick: the flat face is on the ball until the player turns the stick, and the rounded back plays it', () => {
    const s = scene('rules.backStick');
    expect(sampleScene(s, 0.5).figures[0]?.face).toBe('flat');
    const contact = sampleScene(s, 1.7);
    expect(contact.figures[0]?.face).toBe('back');
    expect(contact.figures[0]?.mark).toBe('stick');
    expect(sampleScene(s, s.seconds).verdict).toBe('rules.verdict.freeHit');
  });

  it('dangerous play: the ball reaches the opponent above knee height and inside five metres', () => {
    const s = scene('rules.dangerous');
    const contact = 1.75;
    const b = ballAt(s, contact);
    const opponent = at(s, 1, contact), striker = at(s, 0, contact);
    expect(b.z).toBeGreaterThan(KNEE_Z);
    expect(Math.abs(b.x - opponent)).toBeLessThan(0.5);      // it hits them
    expect(Math.abs(opponent - striker)).toBeLessThan(5);     // from inside five metres
    expect(sampleScene(s, contact).figures[1]?.mark).toBe('body');
  });

  it('feet: the ball arrives at the defender\'s front foot, and the attacker gets the corner', () => {
    const s = scene('rules.feet');
    const contact = 1.85;
    const f = sampleScene(s, contact).figures[1];
    if (!f) throw new Error('no defender');
    const frontFoot = poseOf(f).feet[1].x;
    expect(Math.abs(ballAt(s, contact).x - frontFoot)).toBeLessThan(0.25);
    expect(f.mark).toBe('foot');
    expect(sampleScene(s, s.seconds).verdict).toBe('rules.verdict.pc');
  });

  it('the first shot at a corner crosses the line above the backboard, so it is no goal', () => {
    const s = scene('rules.pcFirstHit');
    const goalX = s.goalX ?? 0;
    let crossing: { x: number; z: number } | null = null;
    for (let t = 0; t <= s.seconds; t += 0.02) { const b = ballAt(s, t); if (b.x >= goalX) { crossing = b; break; } }
    expect(crossing).not.toBeNull();
    expect(crossing?.z ?? 0).toBeGreaterThan(BACKBOARD_Z);
    expect(sampleScene(s, s.seconds).verdict).toBe('rules.verdict.noGoal');
  });

  it('the stroke goes in under the crossbar', () => {
    const s = scene('rules.stroke');
    const goalX = s.goalX ?? 0;
    let crossing: { x: number; z: number } | null = null;
    for (let t = 0; t <= s.seconds; t += 0.02) { const b = ballAt(s, t); if (b.x >= goalX) { crossing = b; break; } }
    expect(crossing?.z ?? 99).toBeLessThan(GOAL_Z);
    expect(sampleScene(s, s.seconds).verdict).toBe('rules.verdict.goal');
  });

  it('the aerial is lifted well clear and lands with everyone more than five metres away', () => {
    const s = scene('rules.aerial');
    let peak = 0, landing = 0;
    for (let t = 0; t <= s.seconds; t += 0.02) { const b = ballAt(s, t); if (b.z > peak) { peak = b.z; } if (b.z <= 0.02 && t > 1) { landing = b.x; break; } }
    expect(peak).toBeGreaterThan(3);
    const opponent = at(s, 1, s.seconds);
    expect(Math.abs(landing - opponent)).toBeGreaterThan(5);
    expect(sampleScene(s, s.seconds).verdict).toBe('rules.verdict.play');
  });

  it('the aerial keeps five metres at both ends: the lift is not played at a nearby opponent, and the receiver is not closed down', () => {
    const s = scene('rules.aerial');
    const lift = 0.95, reception = 3.3;
    // the rule has two halves and the picture must show both, or it teaches the offence it denies
    expect(Math.abs(at(s, 1, lift) - at(s, 0, lift))).toBeGreaterThan(5);
    expect(Math.abs(at(s, 2, reception) - at(s, 1, reception))).toBeGreaterThan(5);
    expect(s.dimensions?.length).toBe(2);
    for (const d of s.dimensions ?? []) expect(Math.abs(d.to - d.from)).toBeCloseTo(5, 5);
  });

  it('the corner shot is drawn to scale: the striker is at the top of the circle, 14.63 m out', () => {
    const s = scene('rules.pcFirstHit');
    expect((s.goalX ?? 0) - ballAt(s, 0).x).toBeCloseTo(14.1, 0);
  });

  it('the card scene: the umpire holds it up and the offender walks off', () => {
    const s = scene('rules.cards');
    const umpire = sampleScene(s, s.seconds).figures[0];
    expect(umpire?.side).toBe('umpire');
    expect(umpire?.arm ?? 0).toBeGreaterThan(0.9);
    expect(poseOf(umpire!).armTip.z).toBeGreaterThan(poseOf(umpire!).head.z); // above the head, where a card is shown
    expect(at(s, 1, s.seconds)).toBeLessThan(at(s, 1, 0) - 2);
    expect(s.card).toBe('green');
  });
});

describe('pose geometry', () => {
  it('a hanging stick reaches the ground and the hook points the way the player faces', () => {
    const p = poseOf({ side: 'us', x: 3, stick: 0, lean: 0, arm: 0, dir: 1, face: 'flat', mark: null });
    expect(p.stickHead.z).toBeLessThan(0.15);
    expect(p.hookTip.x).toBeGreaterThan(p.stickHead.x);
    const left = poseOf({ side: 'us', x: 3, stick: 0, lean: 0, arm: 0, dir: -1, face: 'flat', mark: null });
    expect(left.hookTip.x).toBeLessThan(left.stickHead.x);
  });

  it('a player is about 1.8 m tall and the stick is under a metre', () => {
    const p = poseOf({ side: 'us', x: 0, stick: 0, lean: 0, arm: 0, dir: 1, face: 'flat', mark: null });
    expect(p.head.z).toBeGreaterThan(1.6);
    expect(p.head.z).toBeLessThan(1.95);
    expect(Math.hypot(p.hands.x - p.stickHead.x, p.hands.z - p.stickHead.z)).toBeLessThan(1);
  });
});

describe('the video links', () => {
  it('every video belongs to a real rule and looks like a YouTube id', () => {
    for (const k of RULE_KEYS) {
      const v = ruleVideo(k);
      if (!v) continue;
      expect(v.id, k).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(videoUrl(v)).toBe(`https://www.youtube.com/watch?v=${v.id}`);
      expect(v.title.length, k).toBeGreaterThan(8);
      expect(v.channel.length, k).toBeGreaterThan(3);
    }
  });

  it('the rules that are hardest to picture all have one', () => {
    for (const k of ['rules.backStick', 'rules.dangerous', 'rules.obstruction', 'rules.aerial', 'rules.stroke'] as const) {
      expect(ruleVideo(k), k).not.toBeNull();
    }
  });
});
