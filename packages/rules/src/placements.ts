/**
 * Where the LAW puts players at a restart. Only positions the rules mandate
 * (own half at a centre pass, 5 m at a free hit, behind the line at a PC,
 * beyond the 23 m at a stroke). Where the law is silent, AI (Phase 3) chooses.
 * Only players who currently violate the law are moved.
 */
import {
  CIRCLE_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, LINE_23_X, PENALTY_SPOT_X,
  dmath, type End, type Scalar, type Vec2,
} from '@bullyoff/shared';
import type { Laws } from './laws.js';
import { attackingEnd, teamDefending, type PlayerId, type PlayerView, type Restart, type Ruling, type TeamId } from './types.js';

interface Placement { playerId: PlayerId; x: Scalar; y: Scalar; heading: Scalar }

const clampY = (y: Scalar): Scalar => Math.max(-HALF_WIDTH + 1, Math.min(HALF_WIDTH - 1, y));

export function placementsFor(restart: Restart, players: readonly PlayerView[], laws: Laws): Ruling[] {
  const out: Placement[] = [];
  const onPitch = players.filter((p) => p.onPitch);
  switch (restart.kind) {
    case 'centrePass': {
      // Everyone in their own half; opponents of the taking team ≥ 5 m from the ball (they are, if in own half).
      for (const p of onPitch) {
        const e = attackingEnd(p.team);
        if (e * p.pos.x > -0.5) out.push({ playerId: p.id, x: -e * 2, y: clampY(p.pos.y), heading: e > 0 ? 0 : dmath.PI });
      }
      // The nearest player of the taking team stands at the ball.
      const taker = nearest(onPitch.filter((p) => p.team === restart.team), restart.at);
      if (taker) { const e = attackingEnd(restart.team); out.push({ playerId: taker.id, x: -e * 0.8, y: 0, heading: e > 0 ? 0 : dmath.PI }); }
      break;
    }
    case 'freeHit': case 'hitOut': case 'longCorner': {
      const R = laws.freeHitDistance;
      for (const p of onPitch) {
        if (p.team === restart.team) continue;
        const dx = p.pos.x - restart.at.x, dy = p.pos.y - restart.at.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < R) {
          const ux = d > 1e-6 ? dx / d : -attackingEnd(restart.team), uy = d > 1e-6 ? dy / d : 0;
          out.push({ playerId: p.id, x: clampX(restart.at.x + ux * (R + 0.2)), y: clampY(restart.at.y + uy * (R + 0.2)), heading: p.heading });
        }
      }
      const taker = nearest(onPitch.filter((p) => p.team === restart.team), restart.at);
      if (taker) { const e = attackingEnd(restart.team); out.push({ playerId: taker.id, x: restart.at.x - e * 0.7, y: restart.at.y, heading: e > 0 ? 0 : dmath.PI }); }
      break;
    }
    case 'penaltyCorner': {
      const end = attackingEnd(restart.team);
      const defTeam = teamDefending(end);
      const gx = end * HALF_LENGTH;
      // Injector at the ball, facing the circle.
      const attackers = onPitch.filter((p) => p.team === restart.team);
      const injector = nearest(attackers, restart.at);
      if (injector) out.push({ playerId: injector.id, x: gx - end * 0.3, y: restart.at.y + Math.sign(restart.at.y) * 0.6, heading: dmath.atan2(-restart.at.y, -end * 8) });
      // Other attackers: outside the circle, spread along the top of the D. ALL of them are placed, not only
      // those inside the circle — the 40 s set-up window (clock stopped) is when a real team walks up; the sim
      // compresses that walk into the placement.
      const others = attackers.filter((p) => p.id !== injector?.id);
      // Spread along the D, 0.6 m outside the line: the straight top for the middle few, the post-centred arcs for the rest.
      const R = CIRCLE_RADIUS + 0.6;
      others.forEach((p, i) => {
        const u = others.length === 1 ? 0 : -1 + (2 * i) / (others.length - 1); // -1 … 1 across the D
        let px: Scalar, py: Scalar;
        if (Math.abs(u) < 0.25) { px = gx - end * R; py = (u / 0.25) * GOAL_HALF_WIDTH; }
        else {
          const phi = ((Math.abs(u) - 0.25) / 0.75) * 1.1; // up to ~63° round the arc
          px = gx - end * R * dmath.cos(phi);
          py = Math.sign(u) * (GOAL_HALF_WIDTH + R * dmath.sin(phi));
        }
        out.push({ playerId: p.id, x: px, y: clampY(py), heading: end > 0 ? 0 : dmath.PI });
      });
      // Defenders: GK on the line + up to (pcDefenders − 1) behind the backline; rest beyond the centre line.
      const defenders = onPitch.filter((p) => p.team === defTeam);
      const gk = defenders.find((p) => p.isGoalkeeper);
      const field = defenders.filter((p) => !p.isGoalkeeper).sort((a, b) => dist(a.pos, restart.at) - dist(b.pos, restart.at));
      if (gk) out.push({ playerId: gk.id, x: gx - end * 0.2, y: 0, heading: end > 0 ? dmath.PI : 0 });
      const behind = field.slice(0, Math.max(0, laws.pcDefenders - (gk ? 1 : 0)));
      const slots = [-1.4, -0.5, 0.5, 1.4, 2.6];
      behind.forEach((p, i) => out.push({ playerId: p.id, x: gx + end * 0.4, y: (slots[i] ?? 0) * (restart.at.y > 0 ? 1 : -1), heading: end > 0 ? dmath.PI : 0 }));
      field.slice(behind.length).forEach((p, i) => out.push({ playerId: p.id, x: -end * (1.5 + i * 0.5), y: clampY(-8 + i * 4), heading: end > 0 ? dmath.PI : 0 }));
      break;
    }
    case 'penaltyStroke': {
      const end = attackingEnd(restart.team);
      const defTeam = teamDefending(end);
      const gx = end * HALF_LENGTH;
      const attackers = onPitch.filter((p) => p.team === restart.team);
      const taker = restart.ps?.takerId !== null && restart.ps?.takerId !== undefined
        ? attackers.find((p) => p.id === restart.ps?.takerId) ?? nearest(attackers, restart.at)
        : nearest(attackers, restart.at);
      if (taker) out.push({ playerId: taker.id, x: end * PENALTY_SPOT_X - end * 0.8, y: 0, heading: end > 0 ? 0 : dmath.PI });
      const gk = onPitch.find((p) => p.team === defTeam && p.isGoalkeeper);
      if (gk) out.push({ playerId: gk.id, x: gx - end * 0.15, y: 0, heading: end > 0 ? dmath.PI : 0 });
      // Everyone else beyond the 23 m line of that end.
      let i = 0;
      for (const p of onPitch) {
        if (p.id === taker?.id || p.id === gk?.id) continue;
        if (end * p.pos.x > LINE_23_X - 0.5) { out.push({ playerId: p.id, x: end * (LINE_23_X - 2), y: clampY(-20 + (i++ % 11) * 4), heading: p.heading }); }
      }
      break;
    }
  }
  return out.length ? [{ kind: 'placePlayers', placements: out }] : [];
}

const clampX = (x: Scalar): Scalar => Math.max(-HALF_LENGTH + 0.5, Math.min(HALF_LENGTH - 0.5, x));
const dist = (a: Vec2, b: Vec2): Scalar => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
function nearest(ps: readonly PlayerView[], to: Vec2): PlayerView | undefined {
  let best: PlayerView | undefined; let bd = Infinity;
  for (const p of ps) { const d = dist(p.pos, to); if (d < bd || (d === bd && best && p.id < best.id)) { bd = d; best = p; } }
  return best;
}

/** Long-corner spot: on the 23 m line, in line with where the ball crossed. */
export const longCornerSpot = (end: End, y: Scalar): Vec2 => ({ x: end * LINE_23_X, y: clampY(y) });
/** Hit-out spot: up to 15 m from the backline, in line with where the ball crossed. */
export const hitOutSpot = (end: End, y: Scalar, laws: Laws): Vec2 => ({ x: end * (HALF_LENGTH - laws.hitOutDistance), y: clampY(y) });
/** PC injection spot: on the backline, 10 m from the nearer post, on the side the ball was. */
export const pcSpot = (end: End, y: Scalar, laws: Laws): Vec2 => ({ x: end * HALF_LENGTH, y: (y >= 0 ? 1 : -1) * (GOAL_HALF_WIDTH + laws.pcInjectDistance) });
export const strokeSpot = (end: End): Vec2 => ({ x: end * PENALTY_SPOT_X, y: 0 });
export const centreSpot = (): Vec2 => ({ x: 0, y: 0 });
export const teamOf = (players: readonly PlayerView[], id: PlayerId): TeamId | null => players.find((p) => p.id === id)?.team ?? null;
