/**
 * Scenario fixtures for tests, the determinism harness and (later) the coach
 * review panel (ADR-010). A fixture is data: setup + seed + scripted commands.
 */
import { Rng, dmath } from '@bullyoff/shared';
import type { Command } from '../match/commands.js';
import type { MatchSetup, PlayerSetup } from '../match/match.js';
import type { ProfileId, SurfaceState } from '../profile.js';
import { FIH_OUTDOOR_FAST, type Laws } from '@bullyoff/rules';

/** 11 v 11 in a 4-3-3 / 4-3-3 shape, home attacking +x. Ids 1..11 home, 12..22 away. */
export function standardLineup(): PlayerSetup[] {
  const shape: [number, number][] = [
    [-42, 0],                       // GK
    [-30, -18], [-32, -6], [-32, 6], [-30, 18],   // backs
    [-15, -12], [-18, 0], [-15, 12],              // mids
    [-4, -16], [-2, 0], [-4, 16],                 // forwards
  ];
  const home = shape.map(([x, y], i): PlayerSetup => ({ id: i + 1, team: 0, x, y, heading: 0, isGoalkeeper: i === 0 }));
  const away = shape.map(([x, y], i): PlayerSetup => ({ id: i + 12, team: 1, x: -x, y: -y, heading: dmath.PI, isGoalkeeper: i === 0 }));
  return [...home, ...away];
}

export function sandboxSetup(profile: ProfileId = 'mens', surface: SurfaceState = 'watered'): MatchSetup {
  return { profile, surface, players: standardLineup(), frameEvery: 1, sandbox: true };
}

/**
 * A busy 30-second script: everyone runs in seeded-random directions, the
 * centre forward pushes off, then strikes towards goal; several strikes,
 * traps and collisions occur. Deterministic in `seed`.
 */
export function sandboxScript(seed: number, ticks = 600): Command[] {
  const rng = new Rng(seed, 99);
  const cmds: Command[] = [];
  // ball at the centre spot, home CF (id 10) at (-2, 0) starts with it
  cmds.push({ tick: 0, kind: 'placeBall', x: -1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  cmds.push({ tick: 0, kind: 'strike', playerId: 10, strike: 'push', angle: 0.1, power: 0.6 });
  for (let t = 0; t < ticks; t++) {
    if (t % 20 === 0) {
      for (let id = 1; id <= 22; id++) {
        const a = rng.range(-dmath.PI, dmath.PI);
        cmds.push({ tick: t, kind: 'move', playerId: id, dx: dmath.cos(a), dy: dmath.sin(a), effort: rng.range(0.2, 1) });
      }
    }
    if (t % 45 === 0 && t > 0) {
      const id = rng.int(22) + 1;
      const kinds = ['push', 'slap', 'hit', 'flick', 'aerial'] as const;
      cmds.push({ tick: t, kind: 'strike', playerId: id, strike: rng.pick(kinds), angle: rng.range(-dmath.PI, dmath.PI), power: rng.range(0.4, 1) });
    }
    if (t % 60 === 30) {
      cmds.push({ tick: t, kind: 'trap', playerId: rng.int(22) + 1 });
    }
    // periodically re-place the ball near a random player so strikes actually connect
    if (t % 90 === 0 && t > 0) {
      const id = rng.int(22) + 1;
      cmds.push({ tick: t, kind: 'placeBall', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
      cmds.push({ tick: t, kind: 'placePlayer', playerId: id, x: 0.8, y: 0.2, heading: dmath.PI });
      cmds.push({ tick: t, kind: 'strike', playerId: id, strike: 'hit', angle: rng.range(-0.4, 0.4), power: 1 });
    }
  }
  return cmds;
}

/** Standard lineup plus five bench players per side (ids 23–27 home, 28–32 away). */
export function fullSquads(): PlayerSetup[] {
  const bench: PlayerSetup[] = [];
  for (let i = 0; i < 5; i++) {
    bench.push({ id: 23 + i, team: 0, x: 0, y: -30, heading: 0, onPitch: false });
    bench.push({ id: 28 + i, team: 1, x: 0, y: 30, heading: dmath.PI, onPitch: false });
  }
  return [...standardLineup(), ...bench];
}

/** A full 11-a-side match setup under the laws (not sandbox). */
export function matchSetup(profile: ProfileId = 'mens', surface: SurfaceState = 'watered', laws: Laws = FIH_OUTDOOR_FAST): MatchSetup {
  return { profile, surface, players: fullSquads(), frameEvery: 0, laws, firstCentrePass: 0 };
}
