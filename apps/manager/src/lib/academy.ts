/**
 * The coach academy: what the engine actually models, explained one step at a time.
 *
 * Structure only — every word lives in `i18n/*.json` under `academy.<topic>.*` (ADR-009: all UI
 * strings are translated, names and rules stay data). A step is a short claim plus a diagram, so a
 * coach can walk a topic in a minute and recognise it in the next match report.
 *
 * Diagram coordinates are pitch metres in the engine's own frame (ADR-001: centre origin, +x is the
 * attacked goal). Pixels only exist in the SVG (CLAUDE.md rule 12).
 */

import type { CameraId } from '@bullyoff/render';

export type TopicId = 'penaltyCorner' | 'buildUp' | 'pressing' | 'circleEntry';

/**
 * Which camera the step is drawn through. These are the *same* cameras the match viewer uses
 * (`@bullyoff/render`), so a lesson is framed the way the game frames the moment: the whole court
 * for anything about shape, and from behind the goal for anything that happens facing it.
 */
export type DiagramView = CameraId;

export interface Marker {
  x: number;
  y: number;
  /** us = the coached team, them = the opposition, ball = the ball. */
  side: 'us' | 'them' | 'ball';
  /** Optional single character drawn in the marker (a role letter, a number). */
  tag?: string;
}

export interface Arrow {
  from: [number, number];
  to: [number, number];
  /** pass = the ball travels, run = a player moves off the ball, carry = a player takes it with them. */
  kind: 'pass' | 'run' | 'carry';
  /** Seconds from the start of the step. Omitted = the sequence in §Timing below. */
  at?: number;
  /** Seconds the movement takes. Omitted = the default for its kind. */
  dur?: number;
}

export interface Step {
  /** i18n suffix: `academy.<topic>.steps.<id>.{title,body}`. */
  id: string;
  view: DiagramView;
  markers: Marker[];
  arrows: Arrow[];
}

export interface Topic {
  id: TopicId;
  /** Where this shows up in the game, so the lesson is not abstract. */
  steps: Step[];
}

const us = (x: number, y: number, tag?: string): Marker => (tag === undefined ? { x, y, side: 'us' } : { x, y, side: 'us', tag });
const them = (x: number, y: number, tag?: string): Marker => (tag === undefined ? { x, y, side: 'them' } : { x, y, side: 'them', tag });
const ball = (x: number, y: number): Marker => ({ x, y, side: 'ball' });
const pass = (from: [number, number], to: [number, number]): Arrow => ({ from, to, kind: 'pass' });
const run = (from: [number, number], to: [number, number]): Arrow => ({ from, to, kind: 'run' });
const carry = (from: [number, number], to: [number, number]): Arrow => ({ from, to, kind: 'carry' });

/**
 * Four topics, because they are the four things the engine models deeply enough to be worth
 * teaching: the corner, the outlet, the press, and the way into the D.
 */
export const ACADEMY: Topic[] = [
  {
    id: 'penaltyCorner',
    steps: [
      // the battery: injector, trapper, striker — the sequence before any variant exists.
      // The castle behind the line is five INCLUDING the keeper (FIH 13.5 — same as the rulebook).
      { id: 'battery', view: 'behindGoal',
        markers: [us(45.7, 9.1, 'I'), us(30.5, 1.5, 'T'), us(29.3, 0.2, 'S'), them(45.7, 0, 'K'), them(45.5, -1.4), them(45.5, 1.4), them(45.5, -2.6), them(45.5, 2.6), ball(45.7, 9.1)],
        arrows: [pass([45.7, 9.1], [30.5, 1.5])] },
      // the variants: one shown end to end — the slip to the wide hitter, then the strike.
      // (One continuous ball path: an animation that shows two alternatives at once reads as a
      // teleporting ball, which is exactly what Jan flagged.)
      { id: 'variants', view: 'behindGoal',
        markers: [us(30.5, 1.5, 'T'), us(29.3, 0.2, 'S'), us(27, -3.5), them(45.7, 0, 'K'), them(45.5, -1.4), them(45.5, 1.4), ball(30.5, 1.5)],
        arrows: [pass([30.5, 1.5], [27, -3.5]), pass([27, -3.5], [45.7, -1.2])] },
      // running out: the flyer leaves on the injection and guesses line and height
      { id: 'runningOut', view: 'behindGoal',
        markers: [us(30.5, 1.5, 'T'), us(29.3, 0.2, 'S'), them(45.7, 0, 'K'), them(45.3, -1.4, 'P'), them(45.3, 1.4, 'P'), them(45.3, 0.2, 'R'), ball(30.5, 1.5)],
        arrows: [run([45.3, 0.2], [31, 0.8])] },
      // wearing a variant out: the runner charges the flick they have seen nine times — so the
      // trapper slips it to the striker they kept behind, who scores past the committed runner
      { id: 'wearOut', view: 'behindGoal',
        markers: [us(30.5, 1.5, 'T'), us(29.3, 0.2, 'S'), them(45.7, 0, 'K'), them(45.3, 0.2, 'R'), them(43, 3), ball(30.5, 1.5)],
        arrows: [run([45.3, 0.2], [31.2, 1.3]), pass([30.5, 1.5], [29.3, 0.2]), pass([29.3, 0.2], [45.7, 1.2])] },
    ],
  },
  {
    id: 'buildUp',
    steps: [
      // the shape: backs split around your own D, never receive inside it
      { id: 'shape', view: 'full',
        markers: [us(-42, 0, 'K'), us(-28, -17), us(-30, -6), us(-30, 6), us(-28, 17), us(-12, 0), them(-18, 0), them(-20, -8), ball(-42, 0)],
        arrows: [pass([-42, 0], [-28, 17])] },
      // the free man: the spare back who is never marked is the whole outlet
      { id: 'freeMan', view: 'full',
        markers: [us(-28, 17), us(-30, 6), us(-12, 4), them(-24, 14), them(-14, 6), ball(-28, 17)],
        arrows: [pass([-28, 17], [-30, 6]), pass([-30, 6], [-12, 4])] },
      // up-back-through: the pass that makes a press look silly
      { id: 'upBackThrough', view: 'full',
        markers: [us(-30, 6), us(-8, 10), us(-14, 0), us(10, 6), them(-6, 12), them(-16, 4), ball(-30, 6)],
        arrows: [pass([-30, 6], [-8, 10]), pass([-8, 10], [-14, 0]), pass([-14, 0], [10, 6])] },
      // over the top: the answer to a full press that has left nobody spare — the runner and the
      // ball meet, so the run starts where the runner actually stands
      { id: 'overTheTop', view: 'full',
        markers: [us(-30, 6), us(14, 16), them(-26, 10), them(-20, 2), them(-24, -6), ball(-30, 6)],
        arrows: [pass([-30, 6], [22, 12]), run([14, 16], [22, 12])] },
    ],
  },
  {
    id: 'pressing',
    // One step per system, with the engage line where the ENGINE actually puts it (ai/tactics.ts
    // pressLineM: full 71.5 m from own backline = x +25.8, half 52.25 = x +6.5, zone 35.75 = x −10),
    // then the two principles every system shares. The old single "four systems in one picture" step
    // showed a full-court press while the caption described all four — Jan rightly called it wrong.
    steps: [
      // Full-court press: we attack +x, so they build out from their own goal at +45.7 and we go
      // and get it there. Man-to-man over the whole pitch, nobody spare, nobody resting — the full
      // court is the only frame that shows what that costs at the back.
      { id: 'fullCourt', view: 'full',
        markers: [them(43, 0, 'K'), them(36, -14), them(34, 0), them(36, 14), them(22, -8), them(20, 9),
                  us(38, -12), us(37, 2), us(38, 13), us(24, -7), us(23, 10), us(8, 0), us(-6, -6), us(-8, 7), us(-30, 0, 'K'),
                  ball(36, 14)],
        arrows: [run([38, 13], [36.5, 13.5]), run([24, -7], [22.5, -8])] },
      // Half-court press: they circulate untouched in their own half; the block waits around the
      // halfway line and the first man steps out only when the carrier reaches it. One forward
      // rests high, the free man sits behind the line.
      { id: 'halfCourt', view: 'full',
        markers: [them(43, 0, 'K'), them(36, -12), them(34, 8), them(24, -3), them(14, 13),
                  us(8, -8), us(7, 6), us(-2, -14), us(-4, 0), us(-2, 12), us(-16, -7), us(-17, 7), us(-24, 0, 'F'), us(-34, 0, 'K'), us(24, 12, 'R'),
                  ball(36, -12)],
        arrows: [pass([36, -12], [34, 8]), carry([34, 8], [12, 8]), run([7, 6], [10, 7])] },
      // The splitting press: shepherd to the touchline, the block slides with it, and the far side
      // is conceded on purpose. On a full court you can see how much is being given away.
      { id: 'split', view: 'full',
        markers: [them(18, -20), them(24, -6), them(10, 2), them(26, 16),
                  us(12, -22), us(8, -12), us(2, -3), us(-6, -14), us(-4, 4), us(-20, -6), us(-34, 0, 'K'),
                  ball(18, -20)],
        arrows: [run([12, -22], [16, -19]), run([2, -3], [-1, -10]), run([-4, 4], [-6, -2])] },
      // Zone press: two zonal banks a good ten metres inside our own half; when they switch the
      // ball, nobody chases it — the banks slide across and keep their lanes. Two forwards rest
      // high for the turnover.
      { id: 'zone', view: 'full',
        markers: [them(2, 10), them(6, -12), them(-4, 0), them(16, 16),
                  us(-6, -12), us(-8, 0), us(-6, 12), us(-18, -8), us(-20, 1), us(-18, 10), us(-27, 0, 'F'), us(-38, 0, 'K'),
                  us(12, -6, 'R'), us(14, 8, 'R'),
                  ball(2, 10)],
        arrows: [pass([2, 10], [6, -12]), run([-6, 12], [-7, 4]), run([-18, 10], [-19, 4])] },
      // Who steps out: the ball is in the left channel, so the left-side owner goes and the rest
      // hold their lanes. The far-side half staying home is the whole point.
      { id: 'channels', view: 'full',
        markers: [them(6, -18), them(14, -6), them(2, 8), them(20, 16),
                  us(-2, -16), us(-4, -4), us(-2, 9), us(0, 20), us(-16, -8), us(-18, 6), us(-34, 0, 'K'),
                  ball(6, -18)],
        arrows: [run([-2, -16], [3, -18]), run([-4, -4], [-1, -9])] },
      // Free man and rest-break, drawn where you can see both ends at once: the spare sits behind
      // the line at our end, the two who do not come back wait in theirs.
      { id: 'freeManRest', view: 'full',
        markers: [them(-14, -10), them(-20, 4), them(-6, 12), them(-30, -4),
                  us(-24, -8), us(-26, 5), us(-16, 12), us(-33, 0, 'F'), us(-40, 0, 'K'),
                  us(26, -8, 'R'), us(29, 9, 'R'),
                  ball(-14, -10)],
        arrows: [run([26, -8], [40, -6])] },
    ],
  },
  {
    id: 'circleEntry',
    steps: [
      // nothing scores from outside the D — the entry is the whole game
      { id: 'theLine', view: 'half',
        markers: [us(24, 8), us(36, 2), them(32, 4), ball(24, 8)],
        arrows: [carry([24, 8], [34, 6])] },
      // the baseline pull-back: round the back, to the line, and back to the spot the runner hits
      { id: 'baseline', view: 'behindGoal',
        markers: [us(42, 12), us(37, 4), us(30, -6), them(41, 4), them(45.7, 0, 'K'), ball(42, 12)],
        arrows: [carry([42, 12], [43, 9]), run([30, -6], [36, -2]), pass([43, 9], [36, -2])] },
      // switch and slip: circulate over the top until the block shifts, then slip in behind it
      { id: 'switchSlip', view: 'behindGoal',
        markers: [us(31, -8), us(31, 8), us(34, 7), them(36, -2), them(38, 3), them(45.7, 0, 'K'), ball(31, -8)],
        arrows: [pass([31, -8], [31, 8]), run([34, 7], [40, 5]), pass([31, 8], [40, 5])] },
      // drawing the foot: how most club-level corners are won
      { id: 'drawTheFoot', view: 'goalmouth',
        markers: [us(36, 2), them(39, 2), them(45.7, 0, 'K'), ball(36, 2)],
        arrows: [pass([36, 2], [39, 2])] },
    ],
  },
];

// ── playing a step back ────────────────────────────────────────────────────────
//
// A still diagram shows the shape; a play is a sequence. These are pure functions over the step
// data so the timing is unit-testable without a DOM — the component only owns the clock.

/** How long each kind of movement takes, and the gap before the next one starts. */
const DUR: Record<Arrow['kind'], number> = { pass: 0.65, run: 1.1, carry: 1.2 };
const GAP = 0.25;
/**
 * A run makes the pass, so it leaves before its turn: the receiver is already moving when the ball
 * is struck, which is the whole point of a timed run.
 */
const RUN_LEAD = 0.45;

export interface Timed { at: number; dur: number }

/** Resolve each arrow's start and duration, filling in the sequence where the data does not say. */
export function timeline(arrows: readonly Arrow[]): Timed[] {
  const out: Timed[] = [];
  let cursor = 0;
  for (const a of arrows) {
    const dur = a.dur ?? DUR[a.kind];
    const at = a.at ?? Math.max(0, cursor - (a.kind === 'run' ? RUN_LEAD : 0));
    out.push({ at, dur });
    cursor = Math.max(cursor, at + dur) + GAP;
  }
  return out;
}

/** Total length of a step's play, plus a beat to read the finished picture. */
export function stepDuration(arrows: readonly Arrow[]): number {
  const t = timeline(arrows);
  return t.reduce((m, x) => Math.max(m, x.at + x.dur), 0) + 0.6;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
/** Ease in and out: players accelerate and arrive, they do not teleport at constant speed. */
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const near = (m: Marker, p: [number, number]): number => (m.x - p[0]) ** 2 + (m.y - p[1]) ** 2;

export interface Frame {
  /** Marker positions at time t, in the same order as the step's markers. */
  markers: Marker[];
  /** 0..1 of each arrow that has been travelled — the trail drawn behind the movement. */
  reveal: number[];
}

/**
 * The step at time `t` (seconds). Players move along their run and carry arrows; the ball travels
 * along passes and carries and waits where it was last played. Owners are resolved against the
 * step's *starting* positions, so a chain of arrows still finds the player it means.
 */
export function frameAt(step: Step, t: number): Frame {
  const times = timeline(step.arrows);
  const markers: Marker[] = step.markers.map((m) => ({ ...m }));
  const ballIndex = step.markers.findIndex((m) => m.side === 'ball');
  const reveal: number[] = [];

  step.arrows.forEach((a, i) => {
    const tm = times[i];
    if (!tm) { reveal.push(0); return; }
    const u = clamp01((t - tm.at) / tm.dur);
    const e = ease(u);
    // The trail is what has been travelled, so it uses the *eased* fraction too. With the raw one
    // the line runs ahead of the ball during the ease-in and the pass looks like it arrives twice.
    reveal.push(e);
    if (u <= 0) return;
    const x = lerp(a.from[0], a.to[0], e), y = lerp(a.from[1], a.to[1], e);
    if (a.kind === 'run' || a.kind === 'carry') {
      // the player whose starting position the arrow leaves from
      let best = -1, bd = Infinity;
      step.markers.forEach((m, mi) => {
        if (m.side === 'ball') return;
        const d = near(m, a.from);
        if (d < bd) { bd = d; best = mi; }
      });
      const mk = markers[best];
      if (mk) { mk.x = x; mk.y = y; }
    }
    if (a.kind === 'pass' || a.kind === 'carry') {
      const b = markers[ballIndex];
      if (b) { b.x = x; b.y = y; }
    }
  });
  return { markers, reveal };
}

export const TOPIC_IDS: TopicId[] = ACADEMY.map((t) => t.id);
export const topic = (id: TopicId): Topic | undefined => ACADEMY.find((t) => t.id === id);

/**
 * Which topic a post-match finding sends you to. Kinds that are moments or rule calls deliberately
 * map to nothing: a goal is not a lesson, and the rulebook already owns the rules.
 */
export function topicForFinding(kind: string): TopicId | null {
  switch (kind) {
    case 'pcBattery': case 'pcBatteryGood': case 'pcWon': case 'readPc': return 'penaltyCorner';
    case 'ownFreeHits': case 'aerialsLost': return 'buildUp';
    case 'readUnderSiege': case 'tactics': case 'tacticsSwitch': case 'thirdQuarterLegs':
    case 'switchWorked': case 'switchFailed': return 'pressing';
    case 'readNoShots': return 'circleEntry';
    default: return null;
  }
}
