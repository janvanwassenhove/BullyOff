/**
 * The academy is content, so the test is about content integrity: every step a coach can reach has
 * text in all three languages (ADR-009), every diagram is on the pitch, and every post-match hint
 * leads somewhere. A missing translation is a blank card in the UI, which no type can catch.
 */
import { describe, expect, it } from 'vitest';
import { HALF_LENGTH, HALF_WIDTH } from '@bullyoff/shared';
import { ACADEMY, TOPIC_IDS, frameAt, stepDuration, timeline, topic, topicForFinding } from './academy';
import nl from '../i18n/nl.json';
import en from '../i18n/en.json';
import fr from '../i18n/fr.json';

const LOCALES = { nl, en, fr } as unknown as Record<string, Record<string, unknown>>;
const at = (d: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), d);

describe('academy content', () => {
  it('has four topics and no duplicate ids', () => {
    expect(TOPIC_IDS).toHaveLength(4);
    expect(new Set(TOPIC_IDS).size).toBe(4);
    for (const id of TOPIC_IDS) expect(topic(id)?.id).toBe(id);
  });

  it('every topic and step has a title and body in nl, en and fr', () => {
    for (const [loc, dict] of Object.entries(LOCALES)) {
      for (const tp of ACADEMY) {
        for (const k of ['title', 'sub']) {
          const v = at(dict, `academy.${tp.id}.${k}`);
          expect(typeof v === 'string' && v.length > 0, `${loc}: academy.${tp.id}.${k}`).toBe(true);
        }
        expect(tp.steps.length, `${tp.id} has steps`).toBeGreaterThan(1);
        for (const s of tp.steps) {
          for (const k of ['title', 'body']) {
            const v = at(dict, `academy.${tp.id}.steps.${s.id}.${k}`);
            expect(typeof v === 'string' && v.length > 0, `${loc}: academy.${tp.id}.steps.${s.id}.${k}`).toBe(true);
          }
        }
      }
      for (const k of ['title', 'sub', 'open', 'step', 'prev', 'next', 'finish', 'close', 'steps', 'fromReport']) {
        expect(typeof at(dict, `academy.${k}`), `${loc}: academy.${k}`).toBe('string');
      }
    }
  });

  it('every marker and arrow is on the pitch', () => {
    for (const tp of ACADEMY) {
      for (const s of tp.steps) {
        const pts = [...s.markers.map((m) => [m.x, m.y] as [number, number]), ...s.arrows.flatMap((a) => [a.from, a.to])];
        for (const [x, y] of pts) {
          expect(Math.abs(x), `${tp.id}/${s.id} x`).toBeLessThanOrEqual(HALF_LENGTH);
          expect(Math.abs(y), `${tp.id}/${s.id} y`).toBeLessThanOrEqual(HALF_WIDTH);
        }
        expect(s.markers.length, `${tp.id}/${s.id} has markers`).toBeGreaterThan(1);
      }
    }
  });

  it('maps the findings that carry a hint, and nothing else', () => {
    // A hint with nowhere to go is just a shorter lesson, so the two lists have to agree.
    const hinted = Object.entries((nl as unknown as { insight: Record<string, Record<string, string>> }).insight)
      .filter(([, v]) => typeof v === 'object' && 'hint' in v)
      .map(([k]) => k);
    expect(hinted.length).toBeGreaterThan(5);
    for (const kind of hinted) expect(topicForFinding(kind), `${kind} → topic`).not.toBeNull();
    // moments are not lessons: a goal does not send you to the academy
    for (const kind of ['momentGoal', 'momentCard', 'foul']) expect(topicForFinding(kind)).toBeNull();
    // and the converse: the report renders a hint for anything that maps, so anything that maps
    // must have one. Without this, a mapped-but-hintless finding renders its i18n key on screen.
    const insight = (nl as unknown as { insight: Record<string, Record<string, string>> }).insight;
    for (const kind of Object.keys(insight)) {
      if (topicForFinding(kind) === null) continue;
      expect(typeof insight[kind]?.['hint'], `${kind} maps to a topic so it needs a hint`).toBe('string');
    }
  });

  it('the same hint text exists in all three languages', () => {
    const keys = Object.entries((nl as unknown as { insight: Record<string, Record<string, string>> }).insight)
      .filter(([, v]) => typeof v === 'object' && 'hint' in v).map(([k]) => k);
    for (const [loc, dict] of Object.entries(LOCALES)) {
      for (const k of keys) expect(typeof at(dict, `insight.${k}.hint`), `${loc}: insight.${k}.hint`).toBe('string');
    }
  });
});

describe('playing a step back', () => {
  const steps = ACADEMY.flatMap((tp) => tp.steps.map((s) => ({ tp: tp.id, s })));

  it('sequences arrows without overlapping the same movement twice', () => {
    for (const { tp, s } of steps) {
      const tl = timeline(s.arrows);
      expect(tl).toHaveLength(s.arrows.length);
      for (const x of tl) { expect(x.at).toBeGreaterThanOrEqual(0); expect(x.dur).toBeGreaterThan(0); }
      // passes and carries move the ball, so two of them may never run at the same time
      const ballMoves = s.arrows.map((a, i) => ({ a, ...tl[i]! })).filter((x) => x.a.kind !== 'run');
      for (let i = 1; i < ballMoves.length; i++) {
        const prev = ballMoves[i - 1]!, cur = ballMoves[i]!;
        expect(cur.at, `${tp}/${s.id}: the ball is in two places at once`).toBeGreaterThanOrEqual(prev.at + prev.dur);
      }
    }
  });

  it('a run leaves before the pass it makes', () => {
    // The run makes the pass, not the other way round: a receiver who starts moving after the ball
    // is struck is the thing the timed-run work exists to fix.
    const arrows = [{ from: [0, 0] as [number, number], to: [10, 0] as [number, number], kind: 'pass' as const },
                    { from: [12, 4] as [number, number], to: [20, 4] as [number, number], kind: 'run' as const }];
    const tl = timeline(arrows);
    expect(tl[1]!.at).toBeLessThan(tl[0]!.at + tl[0]!.dur);
  });

  it('starts on the drawn shape and ends on the finished picture', () => {
    for (const { tp, s } of steps) {
      const first = frameAt(s, 0);
      expect(first.markers.map((m) => [m.x, m.y]), `${tp}/${s.id} at t=0`).toEqual(s.markers.map((m) => [m.x, m.y]));
      expect(first.reveal.every((r) => r === 0)).toBe(true);
      const end = frameAt(s, stepDuration(s.arrows));
      expect(end.reveal.every((r) => r === 1), `${tp}/${s.id} finishes every movement`).toBe(true);
      // the ball ends where the last thing that moved it put it
      const lastBall = [...s.arrows].reverse().find((a) => a.kind !== 'run');
      const ball = end.markers.find((m) => m.side === 'ball');
      if (lastBall && ball) { expect(ball.x).toBeCloseTo(lastBall.to[0], 5); expect(ball.y).toBeCloseTo(lastBall.to[1], 5); }
    }
  });

  it('never moves a marker off the pitch mid-play', () => {
    for (const { tp, s } of steps) {
      const d = stepDuration(s.arrows);
      for (let k = 0; k <= 20; k++) {
        for (const m of frameAt(s, (d * k) / 20).markers) {
          expect(Math.abs(m.x), `${tp}/${s.id} x`).toBeLessThanOrEqual(HALF_LENGTH);
          expect(Math.abs(m.y), `${tp}/${s.id} y`).toBeLessThanOrEqual(HALF_WIDTH);
        }
      }
    }
  });

  it('every step is short enough to watch and long enough to read', () => {
    for (const { tp, s } of steps) {
      const d = stepDuration(s.arrows);
      expect(d, `${tp}/${s.id}`).toBeGreaterThan(1);
      expect(d, `${tp}/${s.id}`).toBeLessThan(8);
    }
  });
});
