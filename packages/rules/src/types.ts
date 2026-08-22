/**
 * The narrow interface between physics (engine) and law (rules).
 *
 *   engine ──RulesInput (view + signals)──▶ rules ──Ruling[] + RuleEvent[]──▶ engine
 *
 * Rules never see engine internals; the engine never decides law. Both are pure.
 */
import type { Metres, Radians, Scalar, Vec2, Vec3 } from '@bullyoff/shared';

export type TeamId = 0 | 1;
export type End = 1 | -1;
export type PlayerId = number;
export type StrikeKind = 'push' | 'slap' | 'hit' | 'flick' | 'aerial';
export type StickFace = 'flat' | 'round';

/** Home (0) attacks +x (end +1); away (1) attacks −x. */
export const attackingEnd = (team: TeamId): End => (team === 0 ? 1 : -1);
export const defendingEnd = (team: TeamId): End => (team === 0 ? -1 : 1);
export const otherTeam = (team: TeamId): TeamId => (team === 0 ? 1 : 0);
export const teamDefending = (end: End): TeamId => (end === 1 ? 1 : 0);

// ── what rules may see ────────────────────────────────────────────────────────

export interface PlayerView {
  id: PlayerId;
  team: TeamId;
  pos: Vec2;
  vel: Vec2;
  heading: Radians;
  onPitch: boolean;
  isGoalkeeper: boolean;
  /** 0..1 fatigue state (Phase 7: controllers rotate on it; the rules ignore it). */
  stamina: Scalar;
}

export interface BallView {
  pos: Vec3;
  vel: Vec3;
  speed: Scalar;
  lastTouch: PlayerId | null;
  lastTouchTeam: TeamId | null;
  inCircle: [boolean, boolean]; // [west(-1), east(+1)]
}

export interface RulesView {
  tick: number;
  ball: BallView;
  players: readonly PlayerView[];
  playerById(id: PlayerId): PlayerView | undefined;
}

/** Physics signals for this tick, in temporal order, already resolved by the engine. */
export interface TickSignals {
  struck: { playerId: PlayerId; team: TeamId; kind: StrikeKind; face: StickFace; speed: Scalar; lift: Scalar; at: Vec2 }[];
  trapped: { playerId: PlayerId; team: TeamId; at: Vec2; clean?: boolean }[];
  bodyContacts: { playerId: PlayerId; team: TeamId; at: Vec3; ballSpeed: Scalar; ballHeight: Scalar }[];
  circleEntries: { end: End }[];
  circleExits: { end: End }[];
  goalLineCrossings: { end: End; inGoal: boolean; y: Scalar; z: Scalar }[];
  sidelineCrossings: { side: 1 | -1; x: Scalar }[];
  /** Tackle contests resolved by the engine this tick. */
  tackles: { tacklerId: PlayerId; tacklerTeam: TeamId; carrierId: PlayerId; carrierTeam: TeamId; at: Vec2; outcome: 'won' | 'lost' | 'foulTackler' | 'foulCarrier' }[];
  /** Ball position at the *start* of the tick, for "where was it played from" questions. */
  ballFrom: Vec3;
  stopped: boolean;
}

// ── what rules decide ─────────────────────────────────────────────────────────

export type RestartKind =
  | 'centrePass'
  | 'freeHit'        // any free hit incl. side-in
  | 'hitOut'         // defence free hit 15 m out (ball over backline off attacker)
  | 'longCorner'     // attack free hit on the 23 m line
  | 'penaltyCorner'
  | 'penaltyStroke';

export interface Restart {
  kind: RestartKind;
  team: TeamId;
  /** Where the ball is placed. */
  at: Vec2;
  /** Tick from which the restart may be taken (setup complete). */
  readyTick: number;
  /** For freeHit inside the attacking 23 m: the ball must travel 5 m / be touched before entering the circle. */
  mustTravel?: { from: Vec2; distance: Metres; touchedByOther: boolean };
  /** PC bookkeeping. */
  pc?: { end: End; injected: boolean; firstShotTaken: boolean };
  /** PS bookkeeping. */
  ps?: { end: End; taken: boolean; takerId: PlayerId | null };
}

export type FoulKind =
  | 'feet'            // ball played with foot/body (non-GK, or GK outside circle)
  | 'dangerous'       // raised ball into an opponent within 5 m above knee height
  | 'backStick'       // rounded side of the stick
  | 'obstruction'     // shielding/backing into an opponent
  | 'stickTackle'     // hitting/hooking an opponent's stick — Phase 3 (needs AI/tackle model)
  | 'freeHitDistance' // opponent within 5 m at a free hit
  | 'freeHit23Circle' // ball into circle before travelling 5 m/being touched
  | 'pcBreach'        // defender/attacker breaks early at a PC
  | 'pcHighFirstHit'  // first hit at goal above the backboard
  | 'earlyStroke';    // PS taken before whistle / by wrong player

export type CardColour = 'green' | 'yellow' | 'red';

export type Ruling =
  | { kind: 'goal'; team: TeamId; scorerId: PlayerId | null; end: End; fromPC: boolean; fromPS: boolean }
  | { kind: 'foul'; foul: FoulKind; againstPlayer: PlayerId | null; againstTeam: TeamId; at: Vec2; awards: Restart['kind']; toTeam: TeamId }
  | { kind: 'card'; colour: CardColour; playerId: PlayerId; team: TeamId; suspensionTicks: number; reason: FoulKind | 'persistent' | 'misconduct' }
  | { kind: 'restart'; restart: Restart }
  /** Ball is dead: freeze it and place it at `at`; gate strikes until `restart` is live. */
  | { kind: 'deadBall'; at: Vec2 }
  | { kind: 'placePlayers'; placements: { playerId: PlayerId; x: Scalar; y: Scalar; heading: Radians }[] }
  | { kind: 'suspend'; playerId: PlayerId; untilTick: number }
  | { kind: 'reinstate'; playerId: PlayerId }
  | { kind: 'substitution'; team: TeamId; outId: PlayerId; inId: PlayerId }
  | { kind: 'clock'; running: boolean; reason: 'quarterStart' | 'quarterEnd' | 'goal' | 'penaltyCorner' | 'penaltyStroke' | 'resume' }
  | { kind: 'quarterStart'; quarter: 1 | 2 | 3 | 4; centrePassTeam: TeamId }
  | { kind: 'quarterEnd'; quarter: 1 | 2 | 3 | 4 }
  | { kind: 'fullTime'; score: [number, number] }
  | { kind: 'penaltyCornerAwarded'; team: TeamId; end: End }
  | { kind: 'penaltyCornerTaken'; team: TeamId; end: End }
  | { kind: 'penaltyCornerEnded'; team: TeamId; end: End; outcome: 'goal' | 'cleared' | 'foul' | 'out' | 'stroke' }
  /** A restart not taken in time was given to the other team (FIH 12.1 delaying — engine safeguard). */
  | { kind: 'restartReversed'; from: TeamId; to: TeamId; restart: RestartKind }
  | { kind: 'penaltyStrokeAwarded'; team: TeamId; end: End }
  | { kind: 'penaltyStrokeTaken'; team: TeamId; end: End; scored: boolean };

// ── rules state (serialisable, owned by the engine's MatchState) ──────────────

export type GamePhase = 'preMatch' | 'inPlay' | 'break' | 'fullTime';

export interface Suspension {
  playerId: PlayerId;
  team: TeamId;
  colour: CardColour;
  untilTick: number; // playing-clock ticks (match clock), Infinity for red
}

export interface RulesState {
  phase: GamePhase;
  quarter: 1 | 2 | 3 | 4;
  /** Playing time elapsed in the current quarter, ticks. Only advances while clockRunning. */
  clockTicks: number;
  /** Total playing time elapsed in the match (all quarters). */
  matchClockTicks: number;
  clockRunning: boolean;
  /** Sim ticks remaining in the current break / setup wait. */
  waitTicks: number;
  score: [number, number];
  /** Pending restart while the ball is dead; null when the ball is live. */
  restart: Restart | null;
  /** Ball dead: nobody may play it except the restart taker once ready. */
  ballDead: boolean;
  /** Team taking Q1 centre pass; alternates each quarter. */
  firstCentrePassTeam: TeamId;
  /** Circle rule bookkeeping per end [west, east]: attacker touched inside the circle since last entry. */
  attackerTouchInCircle: [boolean, boolean];
  suspensions: Suspension[];
  personalFouls: Record<PlayerId, number>;
  teamFouls: [number, number];
  /** Player who took the last free hit and the tick — for the "may not play it twice before another touch" self-pass rule (self-pass IS legal; what's illegal is nothing here — kept for stats). */
  lastRestartTaker: PlayerId | null;
  /** True during PC from award to completion (blocks substitutions). */
  pcActive: boolean;
  /** Kind of the first shot at goal in the current PC (for the 460 mm first-hit rule). */
  pcFirstShot: { struckTick: number; kind: StrikeKind } | null;
  /** Team taking the current PC / PS. */
  pcTeam: TeamId | null;
  /** Playing-clock tick of the injection (for the timeout safeguard). */
  pcTakenTick: number | null;
  psActive: boolean;
  psTeam: TeamId | null;
  psShotTick: number | null;
  /** Free hit inside the attacking 23 m: ball must travel 5 m or be touched by another player before entering the circle. */
  pending23: { team: TeamId; takerId: PlayerId; from: Vec2; touchedByOther: boolean } | null;
  /** How the ball was last touched — stick or body — and whether that touch was inside the toucher's own circle (intent heuristic). */
  lastTouchKind: 'stick' | 'body' | null;
  lastTouchInOwnCircle: boolean;
  /** Last player of each team to play the ball with the stick — the goal is credited to them even when it deflects in off a defender or the keeper. */
  lastStickTouch: [PlayerId | null, PlayerId | null];
}
