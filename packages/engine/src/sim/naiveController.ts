/**
 * A deliberately dumb, deterministic controller: everyone drifts between a home
 * spot and the ball; the nearest player plays it towards the opponents' goal;
 * occasional traps, raised balls and substitutions. It exists to exercise the
 * RULES end to end (restarts get taken, fouls happen, cards are issued, quarters
 * pass) — it is NOT hockey. Phase 3 replaces it with the utility AI.
 */
import { HALF_LENGTH, Rng, dmath, in23, type Vec2 } from '@bullyoff/shared';
import { attackingEnd, type RulesState, type RulesView, type TeamId } from '@bullyoff/rules';
import type { Command } from '../match/commands.js';
import type { Controller, PlayerSetup } from '../match/match.js';

export interface NaiveOptions {
  /** Probability per strike that the ball is raised (aerial/flick) — drives dangerous-play fouls. */
  raiseChance?: number;
  /** Probability per strike of using the round side of the stick — drives back-stick fouls. */
  roundFaceChance?: number;
  /** Substitution attempt chance per 200 ticks per team. */
  subChance?: number;
}

export function naiveController(seed: number, lineup: readonly PlayerSetup[], opts: NaiveOptions = {}): Controller {
  const rng = new Rng(seed, 7);
  const home = new Map<number, Vec2>();
  for (const p of lineup) home.set(p.id, { x: p.x, y: p.y });
  const raiseChance = opts.raiseChance ?? 0.08;
  const roundFaceChance = opts.roundFaceChance ?? 0.01;
  const subChance = opts.subChance ?? 0.3;

  return (view: RulesView, rules: Readonly<RulesState>, tick: number): Command[] => {
    const cmds: Command[] = [];
    if (rules.phase !== 'inPlay') return cmds;
    const ball = view.ball.pos;

    for (const team of [0, 1] as TeamId[]) {
      const end = attackingEnd(team);
      const onPitch = view.players.filter((p) => p.team === team && p.onPitch);
      const bench = view.players.filter((p) => p.team === team && !p.onPitch);
      // nearest outfield player to the ball (GK only if ball is deep in own circle)
      let nearest = onPitch[0];
      let bd = Infinity;
      for (const p of onPitch) {
        if (p.isGoalkeeper && Math.abs(ball.x - (-end * HALF_LENGTH)) > 12) continue;
        const d = dmath.hypot(p.pos.x - ball.x, p.pos.y - ball.y);
        if (d < bd) { bd = d; nearest = p; }
      }
      const restartMine = rules.restart !== null && rules.restart.team === team;
      const restartTheirs = rules.restart !== null && rules.restart.team !== team;

      for (const p of onPitch) {
        const isNearest = p.id === nearest?.id;
        if (isNearest && !restartTheirs) {
          const dx = ball.x - p.pos.x, dy = ball.y - p.pos.y;
          cmds.push({ tick, kind: 'move', playerId: p.id, dx, dy, effort: 1 });
          if (bd < 1.4 && ball.z < 0.6) {
            const goalDir = dmath.atan2(0 - ball.y, end * HALF_LENGTH - ball.x);
            const jitter = rng.range(-0.5, 0.5);
            const inAtt23 = in23({ x: ball.x, y: ball.y }, end);
            if (rules.restart && restartMine) {
              // take the restart: a push forwards (PS: a flick at goal)
              if (rules.restart.kind === 'penaltyStroke') cmds.push({ tick, kind: 'strike', playerId: p.id, strike: 'flick', angle: goalDir + rng.range(-0.08, 0.08), power: 0.85 });
              else cmds.push({ tick, kind: 'strike', playerId: p.id, strike: 'push', angle: goalDir + jitter, power: 0.7 });
            } else if (view.ball.speed > 6 && rng.chance(0.4)) {
              cmds.push({ tick, kind: 'trap', playerId: p.id });
            } else {
              const raise = rng.chance(raiseChance);
              const face = rng.chance(roundFaceChance) ? 'round' as const : 'flat' as const;
              const strike = inAtt23 ? (raise ? 'flick' : rng.chance(0.6) ? 'hit' : 'push') : (raise ? 'aerial' : rng.chance(0.5) ? 'hit' : 'push');
              const angle = inAtt23 ? goalDir + rng.range(-0.15, 0.15) : goalDir + jitter;
              cmds.push({ tick, kind: 'strike', playerId: p.id, strike, angle, power: rng.range(0.5, 1), face });
            }
          }
        } else if (p.isGoalkeeper) {
          // GK: hold the line, shuffle towards the ball's y
          const gx = -end * (HALF_LENGTH - 1.5);
          cmds.push({ tick, kind: 'move', playerId: p.id, dx: gx - p.pos.x, dy: ball.y * 0.4 - p.pos.y, effort: 0.6 });
        } else {
          // drift: 65 % home spot, 35 % ball
          const h = home.get(p.id) ?? { x: 0, y: 0 };
          const tx = h.x * 0.65 + ball.x * 0.35, ty = h.y * 0.65 + ball.y * 0.35;
          const dx = tx - p.pos.x, dy = ty - p.pos.y;
          const far = dmath.hypot(dx, dy) > 1.5;
          cmds.push({ tick, kind: 'move', playerId: p.id, dx, dy, effort: far ? 0.55 : 0 });
        }
      }
      // rolling substitutions
      if (tick % 200 === 100 && bench.length > 0 && rng.chance(subChance)) {
        const outs = onPitch.filter((p) => !p.isGoalkeeper);
        const out = outs[rng.int(outs.length)];
        const inn = bench[rng.int(bench.length)];
        if (out && inn) cmds.push({ tick, kind: 'substitute', team, outId: out.id, inId: inn.id });
      }
    }
    return cmds;
  };
}
