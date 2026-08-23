/**
 * Rulebook animations: one short scripted scene per rule, authored as keyframes in metres and
 * seconds and compiled into a replay log the normal pitch renderer plays (so the rulebook shows
 * the same pitch, players and ball the match does — no hand-drawn diagrams). Home attacks +x,
 * the goal at x = +HALF_LENGTH; the first player of each team is drawn as the keeper.
 */
import { HALF_LENGTH, HALF_WIDTH } from '@bullyoff/shared';
import { ENGINE_VERSION, TICK_HZ, type Frame, type MatchEvent, type MatchLog } from '@bullyoff/engine';
import type { CameraChoice, OverlayId } from '@bullyoff/render';
import type { RuleKey } from '@bullyoff/insight';

/** [seconds, x, y] */
type Path = [number, number, number][];
/** [seconds, x, y, z] */
type BallPath = [number, number, number, number][];
interface Actor { team: 0 | 1; path: Path }
export interface ClipDef {
  seconds: number;
  camera: CameraChoice;
  overlay?: OverlayId;
  actors: Actor[];
  ball: BallPath;
  events?: (tick: (s: number) => number) => MatchEvent[];
}

const G = HALF_LENGTH;          // attacking backline
const D = HALF_LENGTH - 14.63;  // top of the circle on the x axis
const SPOT = HALF_LENGTH - 6.4; // penalty spot
const LINE23 = HALF_LENGTH - 22.9;
const SIDE = HALF_WIDTH;

const still = (team: 0 | 1, x: number, y: number, s: number): Actor => ({ team, path: [[0, x, y], [s, x, y]] });
const homeGk = (s: number): Actor => still(0, -G + 1, 0, s);
const awayGk = (s: number): Actor => still(1, G - 1, 0, s);

/** PC set-up: keeper + four defenders behind the line, injector on the backline mark, battery at the top of the D. */
function pcSetup(s: number): Actor[] {
  return [
    awayGk(s), still(1, G - 0.4, 1.4, s), still(1, G - 0.4, -1.4, s), still(1, G - 0.4, 3.1, s), still(1, G - 0.4, -3.1, s),
    homeGk(s), still(0, G - 0.2, 11.8, s), still(0, D + 0.6, 0.6, s), still(0, D + 1.4, -0.4, s), still(0, D + 0.8, 4.2, s), still(0, D + 0.8, -4.6, s),
  ];
}

const CLIPS: Record<RuleKey, ClipDef> = {
  // An attacker drives at a defender in the D; the ball hits the foot — penalty corner.
  'rules.feet': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), { team: 1, path: [[0, D + 6, -1], [2.3, D + 5.6, -2], [6, D + 5.6, -2]] }, still(1, D + 9, 4, 6), homeGk(6),
      { team: 0, path: [[0, D - 5, -6], [2.2, D + 2, -3], [3, D + 3.5, -2.5], [6, D + 3.5, -2.5]] }, still(0, D - 1, 6, 6)],
    ball: [[0, D - 4, -6, 0], [2.2, D + 2.8, -3, 0], [2.6, D + 5.2, -2.2, 0], [2.7, D + 5.3, -2.15, 0], [6, D + 5.3, -2.15, 0]],
    events: (tk) => [{ t: 'PenaltyCornerAwarded', tick: tk(3), team: 0, end: 1 }],
  },
  // A raised ball into an opponent inside 5 m above the knee — dangerous play.
  'rules.dangerous': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), still(1, 20, 0, 6), still(1, 26, 6, 6), homeGk(6), { team: 0, path: [[0, 8, 0], [1.5, 14, 0], [6, 14.5, 0]] }],
    ball: [[0, 9, 0, 0], [1.5, 15, 0, 0], [1.7, 16, 0, 0.3], [2.0, 18.5, 0, 1.2], [2.2, 19.6, 0, 1.25], [2.4, 20.5, 0.3, 0.5], [2.7, 21.2, 0.6, 0], [6, 21.2, 0.6, 0]],
  },
  // The rounded side of the stick plays the ball — free hit.
  'rules.backStick': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), still(1, 14, 4, 6), homeGk(6), { team: 0, path: [[0, -2, -5], [1, 0.5, -5], [6, 0.8, -5]] }, still(0, 18, 3, 6)],
    ball: [[0, -1, -5, 0], [1, 1.2, -5, 0], [1.2, 5, -3.5, 0], [2.5, 14, 0.5, 0], [4, 17.5, 2.2, 0], [6, 17.5, 2.2, 0]],
  },
  // The carrier turns his back and shields the ball from a tackler — obstruction.
  'rules.obstruction': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), { team: 1, path: [[0, D - 7, -1], [1.5, D - 4, -0.2], [2.5, D - 3.4, 0.3], [6, D - 3.4, 0.3]] }, homeGk(6),
      { team: 0, path: [[0, D - 5, 0], [1.5, D - 3, 0], [2.5, D - 2.7, 0.4], [6, D - 2.7, 0.4]] }],
    ball: [[0, D - 4, 0, 0], [1.5, D - 2, 0, 0], [2.5, D - 1.8, 0.2, 0], [6, D - 1.8, 0.2, 0]],
  },
  // A lunge that hits the stick instead of the ball, in the D — penalty corner.
  'rules.stickTackle': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), { team: 1, path: [[0, D + 5, 2], [1.6, D + 4.5, -0.5], [2, D + 4.2, -1.3], [6, D + 4.2, -1.3]] }, homeGk(6),
      { team: 0, path: [[0, D - 1, -4], [2, D + 4, -2], [6, D + 4.5, -1.8]] }],
    ball: [[0, D, -4, 0], [2, D + 4.8, -1.9, 0], [6, D + 4.8, -1.9, 0]],
    events: (tk) => [{ t: 'PenaltyCornerAwarded', tick: tk(2.4), team: 0, end: 1 }],
  },
  // Defenders retreat to five metres before the free hit is taken.
  'rules.freeHitDistance': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), { team: 1, path: [[0, 14.5, 6.5], [1.5, 17.5, 7], [6, 17.5, 7]] }, still(1, 24, -2, 6), homeGk(6), still(0, 11.6, 6, 6), { team: 0, path: [[0, 22, 2], [6, 23, 1.5]] }],
    ball: [[0, 12.3, 6, 0], [2.5, 12.3, 6, 0], [3.2, 22, 2, 0], [6, 23.5, 1.6, 0]],
  },
  // Free hit inside the 23: the taker plays it to himself, the ball travels five metres before the D.
  'rules.selfPass23': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), still(1, D + 2, -3, 6), homeGk(6), { team: 0, path: [[0, LINE23 + 3.5, -10], [0.8, LINE23 + 3.5, -10], [2.2, D - 1, -9], [3.5, D + 2, -6], [6, D + 2, -6]] }],
    ball: [[0, LINE23 + 4, -10, 0], [0.8, LINE23 + 4, -10, 0], [1.0, LINE23 + 6, -9.6, 0], [2.2, D - 0.5, -9, 0], [3.5, D + 2.5, -6, 0], [6, D + 2.5, -6, 0]],
  },
  // A defender breaks from the line before the injection — the corner is taken again.
  'rules.pcBreach': {
    seconds: 6, camera: 'half',
    actors: (() => { const a = pcSetup(6); a[3] = { team: 1, path: [[0, G - 0.4, 3.1], [0.6, G - 0.4, 3.1], [2, D + 5, 2], [6, D + 5, 2]] }; return a; })(),
    ball: [[0, G - 0.2, 11.8, 0], [1.2, G - 0.2, 11.8, 0], [2.0, D + 0.8, 0.6, 0], [6, D + 0.8, 0.6, 0]],
    events: (tk) => [{ t: 'PenaltyCornerAwarded', tick: tk(2.6), team: 0, end: 1 }],
  },
  // The first hit at a corner rises above the backboard — no goal.
  'rules.pcFirstHit': {
    seconds: 6, camera: 'half',
    actors: pcSetup(6),
    ball: [[0, G - 0.2, 11.8, 0], [1.2, G - 0.2, 11.8, 0], [2.0, D + 0.8, 0.6, 0], [2.5, D + 0.8, 0.6, 0], [2.8, D + 8, 0.4, 0.7], [3.1, G - 2, 0.2, 1.2], [3.25, G, 0.2, 1.3], [6, G, 0.2, 1.3]],
  },
  // Penalty stroke: one flick from the spot, the keeper guesses.
  'rules.stroke': {
    seconds: 6, camera: 'half',
    actors: [{ team: 1, path: [[0, G - 0.9, 0], [1.5, G - 0.9, 0], [1.9, G - 0.9, 1.3], [6, G - 0.9, 1.3]] }, homeGk(6), still(0, SPOT - 0.8, 0, 6)],
    ball: [[0, SPOT, 0, 0], [1.5, SPOT, 0, 0], [1.8, G + 0.3, -1.3, 0.6], [6, G + 0.3, -1.3, 0]],
    events: (tk) => [{ t: 'PenaltyStrokeAwarded', tick: tk(0.2), team: 0, end: 1 }, { t: 'Goal', tick: tk(1.9), team: 0, scorerId: 3, end: 1, fromPC: false, fromPS: true, score: [1, 0] }],
  },
  // A goal only counts when an attacker played the ball inside the circle.
  'rules.circle': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), still(1, D + 7, -4, 6), homeGk(6), { team: 0, path: [[0, D - 7, 6], [1.5, D - 1, 4], [2.5, D + 2, 2], [6, D + 2, 2]] }],
    ball: [[0, D - 6, 6, 0], [1.5, D - 0.5, 4, 0], [2.5, D + 2.5, 2, 0], [2.7, D + 2.5, 2, 0], [3.0, G + 0.3, -1, 0.2], [6, G + 0.3, -1, 0]],
    events: (tk) => [{ t: 'Goal', tick: tk(3), team: 0, scorerId: 3, end: 1, fromPC: false, fromPS: false, score: [1, 0] }],
  },
  // Penalty corner: injection, stop at the top of the D, drag flick.
  'rules.pc': {
    seconds: 6, camera: 'half',
    actors: (() => { const a = pcSetup(6); a[1] = { team: 1, path: [[0, G - 0.4, 1.4], [1.2, G - 0.4, 1.4], [2.2, D + 4, 1], [6, D + 4, 1]] }; return a; })(),
    ball: [[0, G - 0.2, 11.8, 0], [1.0, G - 0.2, 11.8, 0], [1.7, D + 0.8, 0.6, 0], [2.2, D + 0.8, 0.6, 0], [2.5, D + 8, 0.8, 0.5], [2.7, G + 0.3, 1.1, 0.7], [6, G + 0.3, 1.1, 0]],
    events: (tk) => [{ t: 'PenaltyCornerTaken', tick: tk(1.0), team: 0, end: 1 }, { t: 'Goal', tick: tk(2.7), team: 0, scorerId: 4, end: 1, fromPC: true, fromPS: false, score: [1, 0] }],
  },
  // A green card: two minutes off, the team plays on with ten.
  'rules.cards': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), { team: 1, path: [[0, 3, 3], [1.2, 5.2, 0.4], [1.5, 5.4, 0], [2.2, 5.4, 0], [5.5, 3, -SIDE + 1], [6, 3, -SIDE + 1]] }, homeGk(6), { team: 0, path: [[0, 2, 0], [1.2, 5, 0], [6, 6, 0.2]] }, still(0, 12, -4, 6)],
    ball: [[0, 3, 0, 0], [1.2, 6, 0, 0], [1.5, 6.6, 0.1, 0], [6, 6.6, 0.1, 0]],
    events: (tk) => [{ t: 'Card', tick: tk(1.6), colour: 'green', playerId: 102, team: 1, suspensionTicks: 2400, reason: 'stickTackle' }],
  },
  // Rolling substitution at the halfway line: one off at the dugout, one on.
  'rules.subs': {
    seconds: 6, camera: 'half',
    actors: [awayGk(6), still(1, 10, 8, 6), homeGk(6), { team: 0, path: [[0, -8, -20], [2, 0, -SIDE + 0.3], [6, 0, -SIDE + 0.3]] }, { team: 0, path: [[0, 2, -SIDE - 0.5], [2, 2, -SIDE - 0.5], [4, 6, -18], [6, 8, -15]] }, still(0, -4, 4, 6)],
    ball: [[0, -3, 5, 0], [6, -3, 5, 0]],
    events: (tk) => [{ t: 'Substitution', tick: tk(2.2), team: 0, outId: 3, inId: 4 }],
  },
  // The aerial: a lifted ball over the press, received safely beyond five metres.
  'rules.aerial': {
    seconds: 6, camera: 'full',
    actors: [awayGk(6), still(1, 0, -3, 6), still(1, 4, 6, 6), homeGk(6), still(0, -12, 0, 6), { team: 0, path: [[0, 19, 5], [3.5, 21.5, 5.2], [6, 22, 5.3]] }],
    ball: [[0, -11, 0, 0], [0.8, -11, 0, 0], [1.1, -8, 0.8, 1.5], [1.7, 0, 2, 4.5], [2.3, 8, 3.2, 4.8], [2.9, 16, 4.4, 2.8], [3.3, 20, 5, 0.8], [3.5, 21.5, 5.2, 0], [6, 22, 5.3, 0]],
  },
};

const lerpPath = (path: Path, t: number): [number, number] => {
  const first = path[0]; const last = path[path.length - 1];
  if (!first || !last) return [0, 0];
  if (t <= first[0]) return [first[1], first[2]];
  if (t >= last[0]) return [last[1], last[2]];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]; const b = path[i + 1];
    if (a && b && t >= a[0] && t <= b[0]) { const u = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0; return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
  }
  return [last[1], last[2]];
};
const lerpBall = (path: BallPath, t: number): [number, number, number] => {
  const first = path[0]; const last = path[path.length - 1];
  if (!first || !last) return [0, 0, 0];
  if (t <= first[0]) return [first[1], first[2], first[3]];
  if (t >= last[0]) return [last[1], last[2], last[3]];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]; const b = path[i + 1];
    if (a && b && t >= a[0] && t <= b[0]) { const u = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0; return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u]; }
  }
  return [last[1], last[2], last[3]];
};

/** Compile a scene into a replay log (frames every 2 ticks) the MatchView can play and loop. */
export function ruleClip(key: RuleKey): { log: MatchLog; camera: CameraChoice; overlay: OverlayId } {
  const def = CLIPS[key];
  const ids = def.actors.map((a, i) => (a.team === 0 ? 1 : 101) + i);
  const every = 2; const eps = 0.05;
  const frames: Frame[] = [];
  for (let tick = 0; tick <= def.seconds * TICK_HZ; tick += every) {
    const t = tick / TICK_HZ;
    const [bx, by, bz] = lerpBall(def.ball, t); const [bx2, by2, bz2] = lerpBall(def.ball, t + eps);
    const players: number[] = [];
    for (const a of def.actors) {
      const [x, y] = lerpPath(a.path, t); const [x2, y2] = lerpPath(a.path, t + eps);
      const vx = (x2 - x) / eps, vy = (y2 - y) / eps;
      const heading = Math.hypot(vx, vy) > 0.3 ? Math.atan2(vy, vx) : Math.atan2(by - y, bx - x);
      players.push(x, y, vx, vy, heading, 0, 1);
    }
    frames.push({ tick, ball: [bx, by, bz, (bx2 - bx) / eps, (by2 - by) / eps, (bz2 - bz) / eps], players });
  }
  const tk = (s: number): number => Math.round(s * TICK_HZ);
  const events: MatchEvent[] = [{ t: 'QuarterStart', tick: 0, quarter: 1, centrePassTeam: 0 }, ...(def.events ? def.events(tk) : [])];
  return {
    log: { header: { format: 'bullyoff-replay', version: 1, engineVersion: ENGINE_VERSION, profile: 'mens', surface: 'watered', seed: 0, tickHz: TICK_HZ, frameEvery: every, playerIds: ids, teams: def.actors.map((a) => a.team) }, events, frames },
    camera: def.camera, overlay: def.overlay ?? 'none',
  };
}
