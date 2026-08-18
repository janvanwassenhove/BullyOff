/**
 * Test harness for the rules: a fake view + signal builder, and helpers to
 * bring a match into live play. Test-only; exported for the engine's tests too.
 */
import { HALF_LENGTH, type Vec2, type Vec3 } from '@bullyoff/shared';
import { FIH_OUTDOOR, type Laws } from './laws.js';
import { createRulesState, stepRules } from './rules.js';
import type { PlayerId, PlayerView, Ruling, RulesState, RulesView, TeamId, TickSignals } from './types.js';

export const TEST_LAWS: Laws = {
  ...FIH_OUTDOOR,
  quarterTicks: 200,
  breakTicks: [5, 10, 5],
  setupTicks: { centrePass: 3, freeHit: 2, penaltyCorner: 4, penaltyStroke: 4 },
  cards: { green: 40, yellow: 100, yellowSerious: 200 },
};

export interface FakePlayer { id: PlayerId; team: TeamId; x: number; y: number; gk?: boolean; onPitch?: boolean }

export class Harness {
  s: RulesState;
  laws: Laws;
  tick = 0;
  ball: Vec3 = { x: 0, y: 0, z: 0 };
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  lastTouch: PlayerId | null = null;
  lastTouchTeam: TeamId | null = null;
  players: FakePlayer[];
  log: Ruling[] = [];

  constructor(players: FakePlayer[], laws: Laws = TEST_LAWS, firstCentrePass: TeamId = 0) {
    this.players = players;
    this.laws = laws;
    this.s = createRulesState(firstCentrePass);
  }

  view(): RulesView {
    const players: PlayerView[] = this.players.map((p) => ({
      id: p.id, team: p.team, pos: { x: p.x, y: p.y }, vel: { x: 0, y: 0 }, heading: 0, onPitch: p.onPitch ?? true, isGoalkeeper: p.gk ?? false,
    }));
    const byId = new Map(players.map((p) => [p.id, p]));
    const b = this.ball, v = this.vel;
    return {
      tick: this.tick,
      ball: { pos: b, vel: v, speed: Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z), lastTouch: this.lastTouch, lastTouchTeam: this.lastTouchTeam, inCircle: [inC(b, -1), inC(b, 1)] },
      players,
      playerById: (id) => byId.get(id),
    };
  }

  /** Step with (partial) signals. Executes deadBall/placePlayers rulings against the fake world. */
  step(sig: Partial<TickSignals> = {}): Ruling[] {
    const full: TickSignals = {
      struck: [], trapped: [], bodyContacts: [], circleEntries: [], circleExits: [], goalLineCrossings: [], sidelineCrossings: [], tackles: [],
      ballFrom: { ...this.ball }, stopped: false, ...sig,
    };
    for (const st of full.struck) { this.lastTouch = st.playerId; this.lastTouchTeam = st.team; }
    for (const st of full.trapped) { this.lastTouch = st.playerId; this.lastTouchTeam = st.team; }
    for (const bc of full.bodyContacts) { this.lastTouch = bc.playerId; this.lastTouchTeam = bc.team; }
    const out = stepRules(this.s, this.laws, this.view(), full);
    for (const r of out) {
      if (r.kind === 'deadBall') { this.ball = { x: r.at.x, y: r.at.y, z: 0 }; this.vel = { x: 0, y: 0, z: 0 }; }
      if (r.kind === 'placePlayers') for (const pl of r.placements) { const p = this.players.find((q) => q.id === pl.playerId); if (p) { p.x = pl.x; p.y = pl.y; } }
      if (r.kind === 'suspend') { const p = this.players.find((q) => q.id === r.playerId); if (p) p.onPitch = false; }
      if (r.kind === 'reinstate') { const p = this.players.find((q) => q.id === r.playerId); if (p) p.onPitch = true; }
    }
    this.log.push(...out);
    this.tick++;
    return out;
  }

  /** Run empty ticks. */
  run(n: number): Ruling[] { const all: Ruling[] = []; for (let i = 0; i < n; i++) all.push(...this.step()); return all; }

  /** From preMatch: start Q1, wait setup, take the centre pass with `takerId` → live ball, clock running. */
  goLive(takerId: PlayerId, team: TeamId = 0): void {
    this.step(); // preMatch → Q1 start (centre pass awarded, dead ball)
    this.run(this.laws.setupTicks.centrePass + 1); // setup wait
    this.step({ struck: [{ playerId: takerId, team, kind: 'push', face: 'flat', speed: 5, lift: 0, at: { x: 0, y: 0 } }] });
  }

  /** Wait out a pending restart's setup and take it with `takerId`. */
  takeRestart(takerId: PlayerId, team: TeamId, kind: 'push' | 'hit' | 'flick' = 'push', lift = 0): Ruling[] {
    this.run(this.s.waitTicks + 1);
    const at: Vec2 = { x: this.ball.x, y: this.ball.y };
    return this.step({ struck: [{ playerId: takerId, team, kind, face: 'flat', speed: 10, lift, at }] });
  }

  has(kind: Ruling['kind'], from = 0): boolean { return this.log.slice(from).some((r) => r.kind === kind); }
  last<K extends Ruling['kind']>(kind: K): Extract<Ruling, { kind: K }> | undefined {
    for (let i = this.log.length - 1; i >= 0; i--) { const r = this.log[i]; if (r?.kind === kind) return r as Extract<Ruling, { kind: K }>; }
    return undefined;
  }
}

function inC(p: { x: number; y: number }, end: 1 | -1): boolean {
  const dx = HALF_LENGTH - end * p.x;
  if (dx < 0 || dx > 14.63) return false;
  const ay = Math.abs(p.y);
  if (ay <= 1.83) return true;
  return dx * dx + (ay - 1.83) ** 2 <= 14.63 * 14.63;
}

/** 11 v 11 in a plain shape; ids 1–11 home (GK 1), 12–22 away (GK 12). */
export function fakeTeams(): FakePlayer[] {
  const out: FakePlayer[] = [];
  const shape: [number, number][] = [[-42, 0], [-30, -18], [-32, -6], [-32, 6], [-30, 18], [-15, -12], [-18, 0], [-15, 12], [-4, -16], [-2, 0], [-4, 16]];
  shape.forEach(([x, y], i) => { out.push({ id: i + 1, team: 0, x, y, gk: i === 0 }); out.push({ id: i + 12, team: 1, x: -x, y: -y, gk: i === 0 }); });
  return out.sort((a, b) => a.id - b.id);
}
