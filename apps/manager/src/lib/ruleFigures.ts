/**
 * Rule scenes a top-down pitch cannot show: the flat face of the stick against its rounded back,
 * the ball at knee height, a ball rising over the backboard, a card in the umpire's hand. These are
 * drawn as a **side elevation** — the view from the sideline, x along the ground, z upwards — with
 * figures rather than dots, because that is the only way you can see which side of the stick played
 * the ball and how high it was.
 *
 * Authored as keyframes in metres and seconds. Sampling and the pose geometry are pure and tested
 * here; the metre → pixel conversion happens in ui/RuleFigure.vue and nowhere else (CLAUDE.md 12).
 * Spatial rules (five metres, the self-pass, breaking early, the circle rule) stay on the real pitch
 * renderer in lib/ruleClips.ts — each rule gets the view that shows it.
 */
import type { RuleKey } from '@bullyoff/insight';

export type Side = 'us' | 'them' | 'umpire';
/** Which side of the stick is towards the ball. The rounded back may not play it (FIH 9.5). */
export type StickFace = 'flat' | 'back';
export type Mark = 'foot' | 'stick' | 'body' | null;

export interface FigureKey {
  t: number;
  /** Position along the ground, metres from the left edge of the scene. */
  x: number;
  /** Shaft angle from the downward vertical, degrees, positive = head swung towards +x. */
  stick: number;
  /** Torso lean, degrees, positive = leaning towards +x. */
  lean?: number;
  /** Raised arm, 0 = down, 1 = straight up (the umpire's card, a keeper's save). */
  arm?: number;
  /** Stepped: which way the figure looks. */
  dir?: 1 | -1;
  /** Stepped: the face of the stick towards the ball. */
  face?: StickFace;
  /** Stepped: the body part the rule bites on, highlighted from this key. */
  mark?: Mark;
}

export interface Figure { side: Side; keys: FigureKey[] }
export interface BallKey { t: number; x: number; z: number }

export interface FigureScene {
  seconds: number;
  /** Scene width in metres (the strip of ground drawn). */
  width: number;
  /** Scene height in metres (how much air is drawn above the ground). */
  height: number;
  figures: Figure[];
  ball: BallKey[];
  /** Furniture that makes the rule readable. */
  show?: ('goal' | 'backboard' | 'kneeLine' | 'stickInset')[];
  /** Where the goal line sits, metres. */
  goalX?: number;
  /** Dimension lines with their measurement (a distance, not prose — the same in every language). */
  dimensions?: { from: number; to: number; label: string }[];
  /**
   * The cards the umpire shows, stepped: from `t` onwards this is the card in the raised hand.
   * Real hockey cards are shaped as well as coloured — green triangular, yellow rectangular, red
   * round — so a colour-blind player still knows which one just went up. The view draws the shapes.
   */
  cards?: { t: number; card: CardColour }[];
  /** The whistle: from this second the verdict band shows (i18n key). */
  verdict?: { t: number; key: string };
}

export type CardColour = 'green' | 'yellow' | 'red';

/** The card in the umpire's hand at time t (stepped at each entry), or null before the first. */
export function cardShownAt(scene: FigureScene, t: number): CardColour | null {
  let out: CardColour | null = null;
  for (const c of scene.cards ?? []) { if (c.t <= t) out = c.card; else break; }
  return out;
}

export interface FigureSample {
  side: Side; x: number; stick: number; lean: number; arm: number; dir: 1 | -1; face: StickFace; mark: Mark;
}
export interface SceneSample { figures: FigureSample[]; ball: { x: number; z: number }; verdict: string | null; card: CardColour | null }

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** Numbers interpolate between keys; `dir`, `face` and `mark` step at the key that sets them. */
function sampleFigure(f: Figure, t: number): FigureSample {
  const keys = f.keys;
  const first = keys[0];
  if (!first) throw new Error('a figure needs at least one keyframe');
  let a = first, b = first, u = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1];
    if (k0 && k1 && t >= k0.t && t <= k1.t) { a = k0; b = k1; u = k1.t > k0.t ? (t - k0.t) / (k1.t - k0.t) : 0; break; }
    if (k1 && t > k1.t) { a = k1; b = k1; u = 0; }
  }
  // stepped fields: the last key at or before t that sets them
  let dir: 1 | -1 = first.dir ?? 1, face: StickFace = first.face ?? 'flat', mark: Mark = first.mark ?? null;
  for (const k of keys) {
    if (k.t > t) break;
    if (k.dir !== undefined) dir = k.dir;
    if (k.face !== undefined) face = k.face;
    if (k.mark !== undefined) mark = k.mark;
  }
  return {
    side: f.side,
    x: lerp(a.x, b.x, u),
    stick: lerp(a.stick, b.stick, u),
    lean: lerp(a.lean ?? 0, b.lean ?? 0, u),
    arm: lerp(a.arm ?? 0, b.arm ?? 0, u),
    dir, face, mark,
  };
}

function sampleBall(keys: readonly BallKey[], t: number): { x: number; z: number } {
  const first = keys[0], last = keys[keys.length - 1];
  if (!first || !last) return { x: 0, z: 0 };
  if (t <= first.t) return { x: first.x, z: first.z };
  if (t >= last.t) return { x: last.x, z: last.z };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (a && b && t >= a.t && t <= b.t) {
      const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      return { x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u) };
    }
  }
  return { x: last.x, z: last.z };
}

/** The ball alone, for drawing the flight path so far. */
export function ballAt(scene: FigureScene, t: number): { x: number; z: number } {
  return sampleBall(scene.ball, Math.max(0, Math.min(scene.seconds, t)));
}

export function sampleScene(scene: FigureScene, t: number): SceneSample {
  const time = Math.max(0, Math.min(scene.seconds, t));
  return {
    figures: scene.figures.map((f) => sampleFigure(f, time)),
    ball: sampleBall(scene.ball, time),
    verdict: scene.verdict && time >= scene.verdict.t ? scene.verdict.key : null,
    card: cardShownAt(scene, time),
  };
}

// ── pose geometry (metres; the view only scales it) ──────────────────────────────

export interface P { x: number; z: number }
export interface Pose { hip: P; shoulder: P; head: P; hands: P; stickHead: P; hookTip: P; feet: [P, P]; armTip: P }

const HIP_Z = 0.95, TORSO = 0.47, NECK = 0.20, HEAD_R = 0.115, HANDS_Z = 1.02, SHAFT = 0.92, HOOK = 0.26;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Where every limb is, for a sampled figure. Heights are real: an 1.8 m player, a 0.92 m stick. */
export function poseOf(f: FigureSample): Pose {
  const l = rad(f.lean);
  const hip: P = { x: f.x, z: HIP_Z };
  const shoulder: P = { x: hip.x + Math.sin(l) * TORSO, z: hip.z + Math.cos(l) * TORSO };
  const head: P = { x: shoulder.x + Math.sin(l) * NECK, z: shoulder.z + Math.cos(l) * NECK + HEAD_R };
  const hands: P = { x: shoulder.x + f.dir * 0.26, z: HANDS_Z };
  const a = rad(f.stick);
  const stickHead: P = { x: hands.x + Math.sin(a) * SHAFT, z: Math.max(0, hands.z - Math.cos(a) * SHAFT) };
  const hookTip: P = { x: stickHead.x + f.dir * HOOK, z: stickHead.z };
  const feet: [P, P] = [{ x: f.x - 0.22 * f.dir, z: 0 }, { x: f.x + 0.26 * f.dir, z: 0 }];
  // the raised arm swings from beside the body to straight up
  const armTip: P = { x: shoulder.x - f.dir * (0.34 - 0.3 * f.arm), z: shoulder.z - 0.42 + 0.95 * f.arm };
  return { hip, shoulder, head, hands, stickHead, hookTip, feet, armTip };
}

/** Knee height (FIH: a raised ball played at an opponent inside 5 m above this is dangerous). */
export const KNEE_Z = 0.5;
/** Backboard height at the goal — the first shot at a penalty corner must not cross above it. */
export const BACKBOARD_Z = 0.46;
/** Goal height. */
export const GOAL_Z = 2.14;

// ── the scenes ───────────────────────────────────────────────────────────────────

const SCENES: Partial<Record<RuleKey, FigureScene>> = {
  // The attacker drives at the defender and plays the ball into their foot: penalty corner.
  'rules.feet': {
    seconds: 3.6, width: 9, height: 2.6,
    figures: [
      { side: 'us', keys: [{ t: 0, x: 2.2, stick: -18, dir: 1 }, { t: 0.9, x: 2.4, stick: 22 }, { t: 1.4, x: 3.2, stick: 10 }, { t: 3.6, x: 4.2, stick: 6 }] },
      { side: 'them', keys: [{ t: 0, x: 6.2, stick: -12, dir: -1 }, { t: 1.4, x: 5.9, stick: -20 }, { t: 1.85, x: 5.9, stick: -20, mark: 'foot' }, { t: 3.6, x: 5.9, stick: -14, mark: 'foot' }] },
    ],
    ball: [{ t: 0, x: 2.7, z: 0 }, { t: 0.9, x: 2.9, z: 0 }, { t: 1.85, x: 5.62, z: 0 }, { t: 2.1, x: 5.5, z: 0.06 }, { t: 3.6, x: 5.4, z: 0 }],
    verdict: { t: 1.95, key: 'rules.verdict.pc' },
  },
  // A raised ball played at an opponent inside five metres, above the knee.
  'rules.dangerous': {
    seconds: 3.6, width: 9, height: 3, show: ['kneeLine'], dimensions: [{ from: 1.6, to: 6.6, label: '5 m' }],
    figures: [
      { side: 'us', keys: [{ t: 0, x: 1.6, stick: -34, dir: 1 }, { t: 0.7, x: 1.6, stick: -46 }, { t: 1.0, x: 1.7, stick: 26 }, { t: 3.6, x: 1.9, stick: 14 }] },
      { side: 'them', keys: [{ t: 0, x: 5.4, stick: -10, dir: -1 }, { t: 1.6, x: 5.4, stick: -6, lean: 6 }, { t: 1.75, x: 5.4, stick: -4, lean: 10, mark: 'body' }, { t: 3.6, x: 5.5, stick: -8, lean: 4, mark: 'body' }] },
    ],
    ball: [{ t: 0, x: 2.0, z: 0.03 }, { t: 1.0, x: 2.0, z: 0.03 }, { t: 1.4, x: 3.6, z: 0.62 }, { t: 1.75, x: 5.1, z: 0.98 }, { t: 2.2, x: 4.9, z: 0.42 }, { t: 3.6, x: 4.7, z: 0 }],
    verdict: { t: 1.9, key: 'rules.verdict.freeHit' },
  },
  // The player turns the stick and plays the ball with the rounded back.
  'rules.backStick': {
    seconds: 3.4, width: 8, height: 2.6, show: ['stickInset'],
    figures: [
      { side: 'us', keys: [{ t: 0, x: 4.0, stick: 12, dir: -1, face: 'flat' }, { t: 1.0, x: 4.0, stick: -8 }, { t: 1.25, x: 4.0, stick: -26, face: 'back' }, { t: 1.7, x: 4.0, stick: 18, mark: 'stick' }, { t: 3.4, x: 4.1, stick: 8, mark: 'stick' }] },
    ],
    ball: [{ t: 0, x: 1.0, z: 0 }, { t: 1.55, x: 3.5, z: 0 }, { t: 1.7, x: 3.6, z: 0 }, { t: 2.4, x: 6.4, z: 0 }, { t: 3.4, x: 7.3, z: 0 }],
    verdict: { t: 1.85, key: 'rules.verdict.freeHit' },
  },
  // The carrier turns his back into the tackler and shields the ball.
  'rules.obstruction': {
    seconds: 3.4, width: 9, height: 2.6,
    figures: [
      { side: 'us', keys: [{ t: 0, x: 4.4, stick: 16, dir: 1 }, { t: 1.1, x: 4.4, stick: -10 }, { t: 1.4, x: 4.3, stick: -18, dir: -1, lean: -8 }, { t: 1.9, x: 4.2, stick: -16, lean: -12, mark: 'body' }, { t: 3.4, x: 4.2, stick: -14, lean: -10, mark: 'body' }] },
      { side: 'them', keys: [{ t: 0, x: 7.2, stick: -14, dir: -1 }, { t: 1.5, x: 5.6, stick: -34 }, { t: 2.1, x: 5.4, stick: -44 }, { t: 3.4, x: 5.5, stick: -30 }] },
    ],
    ball: [{ t: 0, x: 4.9, z: 0 }, { t: 1.1, x: 4.9, z: 0 }, { t: 1.9, x: 3.8, z: 0 }, { t: 3.4, x: 3.7, z: 0 }],
    verdict: { t: 2.0, key: 'rules.verdict.freeHit' },
  },
  // A lunge that hits the stick instead of the ball, inside the circle.
  'rules.stickTackle': {
    seconds: 3.4, width: 9, height: 2.6,
    figures: [
      { side: 'us', keys: [{ t: 0, x: 4.8, stick: 20, dir: 1 }, { t: 1.4, x: 5.0, stick: 16 }, { t: 1.65, x: 5.0, stick: 16, mark: 'stick' }, { t: 3.4, x: 5.0, stick: 20, mark: 'stick' }] },
      { side: 'them', keys: [{ t: 0, x: 7.0, stick: -8, dir: -1 }, { t: 1.2, x: 6.5, stick: -34 }, { t: 1.65, x: 6.3, stick: -58, mark: 'stick' }, { t: 3.4, x: 6.3, stick: -50, mark: 'stick' }] },
    ],
    ball: [{ t: 0, x: 5.5, z: 0 }, { t: 3.4, x: 5.5, z: 0 }],
    verdict: { t: 1.85, key: 'rules.verdict.pc' },
  },
  // The first shot at a penalty corner crosses the line above the backboard.
  'rules.pcFirstHit': {
    // to scale: the shot is taken at the top of the circle, 14.63 m from the goal line
    seconds: 3.4, width: 16, height: 3, show: ['goal', 'backboard'], goalX: 15.5,
    figures: [
      { side: 'us', keys: [{ t: 0, x: 0.9, stick: -30, dir: 1 }, { t: 0.8, x: 0.9, stick: -44 }, { t: 1.15, x: 1.1, stick: 24 }, { t: 3.4, x: 1.3, stick: 12 }] },
      { side: 'them', keys: [{ t: 0, x: 14.9, stick: -6, dir: -1, arm: 0.5 }, { t: 1.7, x: 14.9, stick: -4, arm: 0.85 }, { t: 3.4, x: 14.9, stick: -6, arm: 0.5 }] },
    ],
    ball: [{ t: 0, x: 1.4, z: 0 }, { t: 1.15, x: 1.4, z: 0 }, { t: 1.9, x: 15.5, z: 0.92 }, { t: 2.2, x: 15.9, z: 0.88 }, { t: 3.4, x: 15.9, z: 0 }],
    verdict: { t: 1.95, key: 'rules.verdict.noGoal' },
  },
  // One flick from the spot; the keeper commits the other way.
  'rules.stroke': {
    seconds: 3.4, width: 10, height: 3, show: ['goal'], goalX: 8.6,
    figures: [
      { side: 'us', keys: [{ t: 0, x: 2.4, stick: -20, dir: 1 }, { t: 1.2, x: 2.4, stick: -34 }, { t: 1.5, x: 2.6, stick: 30 }, { t: 3.4, x: 2.7, stick: 16 }] },
      { side: 'them', keys: [{ t: 0, x: 8.3, stick: -4, dir: -1, arm: 0.4 }, { t: 1.5, x: 8.3, stick: -4, arm: 0.6 }, { t: 1.9, x: 8.1, stick: 10, arm: 1, lean: -14 }, { t: 3.4, x: 8.1, stick: 8, arm: 0.9, lean: -12 }] },
    ],
    ball: [{ t: 0, x: 2.8, z: 0 }, { t: 1.5, x: 2.8, z: 0 }, { t: 2.05, x: 8.6, z: 1.18 }, { t: 2.4, x: 9.2, z: 0.9 }, { t: 3.4, x: 9.2, z: 0 }],
    verdict: { t: 2.15, key: 'rules.verdict.goal' },
  },
  // The escalation, all three cards in one scene: green (two minutes), then yellow (five or ten),
  // then red (off for good) — the player steps further away with each one. The arm dips between
  // cards so each new shape/colour is a fresh "showing". Shapes matter: see `cards` on FigureScene.
  'rules.cards': {
    seconds: 7.2, width: 9, height: 3,
    cards: [{ t: 0.8, card: 'green' }, { t: 2.7, card: 'yellow' }, { t: 4.9, card: 'red' }],
    figures: [
      { side: 'umpire', keys: [
        { t: 0, x: 5.4, stick: 0, dir: -1, arm: 0 }, { t: 0.9, x: 5.4, stick: 0, arm: 1 }, { t: 2.2, x: 5.4, stick: 0, arm: 1 },
        { t: 2.5, x: 5.4, stick: 0, arm: 0.3 }, { t: 2.9, x: 5.4, stick: 0, arm: 1 }, { t: 4.4, x: 5.4, stick: 0, arm: 1 },
        { t: 4.7, x: 5.4, stick: 0, arm: 0.3 }, { t: 5.1, x: 5.4, stick: 0, arm: 1 }, { t: 7.2, x: 5.4, stick: 0, arm: 1 },
      ] },
      { side: 'them', keys: [
        { t: 0, x: 3.6, stick: -10, dir: -1 }, { t: 1.2, x: 3.6, stick: -10 }, { t: 2.2, x: 2.9, stick: -8 },
        { t: 3.4, x: 2.9, stick: -8 }, { t: 4.4, x: 2.0, stick: -8 }, { t: 5.4, x: 2.0, stick: -6 }, { t: 7.2, x: 0.3, stick: -4 },
      ] },
    ],
    ball: [{ t: 0, x: 6.8, z: 0 }, { t: 7.2, x: 6.8, z: 0 }],
    verdict: { t: 0.95, key: 'rules.verdict.card' },
  },
  // A lifted ball over the press, taken down with everyone five metres clear.
  'rules.aerial': {
    seconds: 4.4, width: 13, height: 5,
    dimensions: [{ from: 1.0, to: 6.0, label: '5 m' }, { from: 7.0, to: 12.0, label: '5 m' }],
    figures: [
      { side: 'us', keys: [{ t: 0, x: 1.0, stick: -26, dir: 1 }, { t: 0.6, x: 1.0, stick: -40 }, { t: 0.95, x: 1.2, stick: 18 }, { t: 4.4, x: 1.4, stick: 8 }] },
      { side: 'them', keys: [{ t: 0, x: 6.4, stick: -10, dir: -1 }, { t: 1.6, x: 6.4, stick: -30, arm: 0.3 }, { t: 4.4, x: 6.6, stick: -12 }] },
      { side: 'us', keys: [{ t: 0, x: 12.1, stick: -8, dir: -1 }, { t: 2.6, x: 12.0, stick: -18 }, { t: 3.3, x: 11.9, stick: -34 }, { t: 4.4, x: 11.8, stick: -10 }] },
    ],
    ball: [{ t: 0, x: 1.5, z: 0.02 }, { t: 0.95, x: 1.5, z: 0.05 }, { t: 1.7, x: 5.0, z: 2.8 }, { t: 2.4, x: 8.2, z: 4.0 }, { t: 3.3, x: 11.7, z: 0.45 }, { t: 3.6, x: 11.8, z: 0 }, { t: 4.4, x: 11.8, z: 0 }],
    verdict: { t: 3.7, key: 'rules.verdict.play' },
  },
};

/** Rules that are shown as a side-elevation scene rather than on the pitch. */
export const FIGURE_RULES = Object.keys(SCENES) as RuleKey[];
export const figureScene = (key: RuleKey): FigureScene | null => SCENES[key] ?? null;
