/**
 * The circle-warped spatial value function (BRIEF §5.4).
 *
 * Football value grids rise smoothly towards goal. Hockey's does not: nothing
 * outside the shooting circle can score, so possession in midfield is worth
 * comparatively little, the top of the D is a staging area, and the inside of
 * the circle — especially the strip from the penalty spot to the posts — is
 * where almost all value lives. Passing lanes *into* the circle are the most
 * valuable objects on the pitch. Every AI decision consumes this function.
 *
 * Analytic rather than a stored grid: cheap, resolution-free, testable in shape.
 * `end` is the goal being attacked; coordinates are pitch metres.
 */
import {
  CIRCLE_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, LINE_23_X, PENALTY_SPOT_X, clamp, dmath, inCircle,
  type End, type Scalar, type Vec2,
} from '@bullyoff/shared';

/** Distance from a point to the nearest point of the circle line at `end` (0 if inside). */
export function distanceOutsideCircle(p: Vec2, end: End): Scalar {
  const dx = HALF_LENGTH - end * p.x; // metres in from the backline
  const ay = Math.abs(p.y);
  if (dx < 0) return 0.01 + -dx;
  if (ay <= GOAL_HALF_WIDTH) return Math.max(0, dx - CIRCLE_RADIUS);
  const py = ay - GOAL_HALF_WIDTH;
  return Math.max(0, Math.sqrt(dx * dx + py * py) - CIRCLE_RADIUS);
}

/** Angle subtended by the goal mouth from a point (radians). Wider = better shooting angle. */
export function goalAngle(p: Vec2, end: End): Scalar {
  const gx = end * HALF_LENGTH;
  const a1 = dmath.atan2(GOAL_HALF_WIDTH - p.y, gx - p.x);
  const a2 = dmath.atan2(-GOAL_HALF_WIDTH - p.y, gx - p.x);
  return Math.abs(dmath.angleDelta(a1, a2));
}

/**
 * Shot quality 0..1 from a point inside the circle: goal angle, distance, and how
 * far the keeper is from the ball→goal-centre line. Below ~0.15 the AI does not shoot.
 */
export function shotQuality(p: Vec2, end: End, keeper: Vec2 | null): Scalar {
  if (!inCircle(p, end)) return 0;
  const gx = end * HALF_LENGTH;
  const dist = Math.sqrt((gx - p.x) ** 2 + p.y ** 2);
  const ang = goalAngle(p, end);            // ~0.25 rad from the top of the D, ~1.2 rad from the spot
  const angleQ = clamp(ang / 0.9, 0, 1);
  const distQ = clamp(1 - (dist - 5) / 12, 0.2, 1);
  let keeperQ = 0.6;
  if (keeper) {
    // keeper offset from the ball–goal line, normalised by goal half-width
    const lx = gx - p.x, ly = -p.y;
    const ll = Math.sqrt(lx * lx + ly * ly) || 1;
    const kx = keeper.x - p.x, ky = keeper.y - p.y;
    const perp = Math.abs(kx * ly - ky * lx) / ll;
    const along = (kx * lx + ky * ly) / ll;
    keeperQ = along < 0 ? 1 : clamp(0.35 + perp / (GOAL_HALF_WIDTH * 1.2), 0.35, 1);
  }
  return clamp(0.15 + 0.85 * angleQ * distQ * keeperQ, 0, 1);
}

/**
 * Positional value of possession at `p` for the team attacking `end`, in [0, 1].
 *  - progression: mild, linear (0 → 0.25 own line → attacking line)
 *  - the 23 m: a step
 *  - the staging zone within 6 m outside the circle: rises steeply towards the line
 *  - inside the circle: 0.55 + shot quality-ish; the strip spot→posts is the peak
 *  - own circle: possession is a liability (slightly negative pull), it's where you concede
 */
export function pitchValue(p: Vec2, end: End): Scalar {
  const xp = end * p.x; // metres towards the attacked goal
  let v = 0.25 * clamp((xp + HALF_LENGTH) / (2 * HALF_LENGTH), 0, 1);
  if (xp >= LINE_23_X) v += 0.08;
  const outside = distanceOutsideCircle(p, end);
  if (inCircle(p, end)) {
    const gx = end * HALF_LENGTH;
    const dist = Math.sqrt((gx - p.x) ** 2 + p.y ** 2);
    const central = clamp(1 - Math.abs(p.y) / 12, 0, 1);
    const depth = clamp(1 - Math.abs(dist - 8) / 9, 0, 1); // peak around the spot (6.4 m) to 10 m
    v = 0.6 + 0.4 * (0.5 * central + 0.5 * depth) * clamp(goalAngle(p, end) / 0.9, 0.2, 1);
    // the baseline pocket (deep and wide) is worth something: pull-back territory
    if (dist > 10 && Math.abs(p.y) > 6) v = Math.max(v, 0.62);
  } else if (outside < 6) {
    v += 0.10 * (1 - outside / 6) * clamp(1 - Math.abs(p.y) / 20, 0.3, 1);
  }
  // own circle: don't dawdle
  if (inCircle(p, -end as End)) v -= 0.08;
  // touchline strips are worth a bit less (fewer options)
  if (Math.abs(p.y) > HALF_WIDTH - 3) v -= 0.03;
  return clamp(v, -0.1, 1);
}

/** Value of a pass *lane* into the circle: the entry point value if the lane crosses the circle line, else 0. */
export function laneEntersCircle(from: Vec2, to: Vec2, end: End): boolean {
  return !inCircle(from, end) && inCircle(to, end);
}

/** A sensible default target inside the circle for a "play into the D" pass: the near-spot strip on the ball's side. */
export const spotStrip = (end: End, side: number): Vec2 => ({ x: end * PENALTY_SPOT_X, y: clamp(side, -1, 1) * 2 });
