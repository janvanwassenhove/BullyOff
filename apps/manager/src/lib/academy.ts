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

export type TopicId = 'penaltyCorner' | 'buildUp' | 'pressing' | 'circleEntry';

/** Which slice of the pitch a step draws. */
export type DiagramView = 'full' | 'attackingHalf' | 'circle';

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
      // the battery: injector, trapper, striker — the sequence before any variant exists
      { id: 'battery', view: 'circle',
        markers: [us(45.7, 9.1, 'I'), us(30.5, 1.5, 'T'), us(29.3, 0.2, 'S'), them(45.7, 0), them(44, -1.4), them(44, 1.4), ball(45.7, 9.1)],
        arrows: [pass([45.7, 9.1], [30.5, 1.5])] },
      // the variants: what each one is for
      { id: 'variants', view: 'circle',
        markers: [us(30.5, 1.5, 'T'), us(29.3, 0.2, 'S'), us(27, -3.5), them(45.7, 0), them(44, -1.4), them(44, 1.4), ball(30.5, 1.5)],
        arrows: [pass([30.5, 1.5], [27, -3.5]), pass([29.3, 0.2], [45.7, 2.5])] },
      // running out: the flyer leaves on the injection and guesses line and height
      { id: 'runningOut', view: 'circle',
        markers: [us(30.5, 1.5, 'T'), us(29.3, 0.2, 'S'), them(45.7, 0, 'K'), them(45.3, -1.4, 'P'), them(45.3, 1.4, 'P'), them(45.3, 0.2, 'R'), ball(30.5, 1.5)],
        arrows: [run([45.3, 0.2], [31, 0.8])] },
      // wearing a variant out: run the same one all season and the league sets up for it
      { id: 'wearOut', view: 'circle',
        markers: [us(30.5, 1.5, 'T'), us(29.3, 0.2, 'S'), them(45.7, 0, 'K'), them(45.3, 0.2, 'R'), them(43, 3), ball(30.5, 1.5)],
        arrows: [run([45.3, 0.2], [30.6, 1.2]), pass([29.3, 0.2], [45.7, 3.2])] },
    ],
  },
  {
    id: 'buildUp',
    steps: [
      // the shape: backs split around your own D, never receive inside it
      { id: 'shape', view: 'full',
        markers: [us(-42, 0, 'K'), us(-28, -17), us(-30, -6), us(-30, 6), us(-28, 17), us(-12, 0), them(-18, 0), them(-20, -8)],
        arrows: [pass([-42, 0], [-28, 17])] },
      // the free man: the spare back who is never marked is the whole outlet
      { id: 'freeMan', view: 'full',
        markers: [us(-28, 17), us(-30, 6), us(-12, 4), them(-24, 14), them(-14, 6), ball(-28, 17)],
        arrows: [pass([-28, 17], [-30, 6]), pass([-30, 6], [-12, 4])] },
      // up-back-through: the pass that makes a press look silly
      { id: 'upBackThrough', view: 'full',
        markers: [us(-30, 6), us(-8, 10), us(-14, 0), us(10, 6), them(-6, 12), them(-16, 4)],
        arrows: [pass([-30, 6], [-8, 10]), pass([-8, 10], [-14, 0]), pass([-14, 0], [10, 6])] },
      // over the top: the answer to a full press that has left nobody spare
      { id: 'overTheTop', view: 'full',
        markers: [us(-30, 6), us(20, 12), them(-26, 10), them(-20, 2), them(-24, -6)],
        arrows: [pass([-30, 6], [20, 12]), run([14, 16], [22, 12])] },
    ],
  },
  {
    id: 'pressing',
    steps: [
      // the four systems on one board
      { id: 'systems', view: 'full',
        markers: [them(-20, 0), us(-14, 0), us(-6, -10), us(-6, 10), us(4, 0), ball(-20, 0)],
        arrows: [run([-14, 0], [-18, 2])] },
      // who steps: the channel owner, not the nearest body
      { id: 'channels', view: 'full',
        markers: [them(-10, -16), us(-2, -14), us(0, 0), us(-1, 14), ball(-10, -16)],
        arrows: [run([-2, -14], [-8, -16])] },
      // the free man and the rest-break: what a system costs and what it buys
      { id: 'freeManRest', view: 'full',
        markers: [us(-24, 0, 'F'), us(-10, -8), us(-10, 8), us(18, -6, 'R'), us(20, 8, 'R'), them(-14, 0), them(-6, -12)],
        arrows: [run([18, -6], [30, -4])] },
      // splitting: shepherd to the line, slide across, concede the far side
      { id: 'split', view: 'full',
        markers: [them(-12, -12), us(-6, -14), us(-4, -4), us(0, 4), us(6, -8), ball(-12, -12)],
        arrows: [run([-6, -14], [-10, -10]), run([0, 4], [-2, -4])] },
    ],
  },
  {
    id: 'circleEntry',
    steps: [
      // nothing scores from outside the D — the entry is the whole game
      { id: 'theLine', view: 'attackingHalf',
        markers: [us(24, 8), us(36, 2), them(32, 4), ball(24, 8)],
        arrows: [carry([24, 8], [34, 6])] },
      // the baseline pull-back
      { id: 'baseline', view: 'circle',
        markers: [us(42, 12), us(37, 0), us(33, -4), them(41, 4), them(45.7, 0, 'K'), ball(42, 12)],
        arrows: [carry([38, 14], [43, 9]), pass([43, 9], [37, 0]), run([30, -6], [33, -4])] },
      // switch and slip
      { id: 'switchSlip', view: 'circle',
        markers: [us(31, -8), us(31, 8), us(40, 5), them(36, -2), them(38, 3), them(45.7, 0, 'K'), ball(31, -8)],
        arrows: [pass([31, -8], [31, 8]), pass([31, 8], [40, 5])] },
      // drawing the foot: how most club-level corners are won
      { id: 'drawTheFoot', view: 'circle',
        markers: [us(36, 2), them(39, 2), them(45.7, 0, 'K'), ball(36, 2)],
        arrows: [pass([36, 2], [39, 2])] },
    ],
  },
];

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
