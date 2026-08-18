/**
 * The laws applied. `stepRules(state, laws, view, signals)` is called by the
 * engine once per tick AFTER physics; it returns rulings the engine executes.
 * `gateCommand` is called BEFORE physics to decide who may play the ball.
 *
 * Every hockey decision here has a comment with the hockey reason. Where the
 * FIH wording is ambiguous or league-specific the code says PROVISIONAL and
 * KICKOFF.md carries the question for Jan. Nothing is invented silently.
 */
import { GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, dmath, inCircle, in23, type End, type Scalar, type Vec2 } from '@bullyoff/shared';
import type { Laws } from './laws.js';
import { centreSpot, hitOutSpot, longCornerSpot, pcSpot, placementsFor, strokeSpot } from './placements.js';
import {
  attackingEnd, otherTeam, teamDefending,
  type CardColour, type FoulKind, type PlayerId, type Restart, type RestartKind, type Ruling, type RulesState,
  type RulesView, type TeamId, type TickSignals,
} from './types.js';

export interface RulesStartOptions {
  /** Start with the ball live in open play at this quarter/clock (scenario fixtures), instead of pre-match. */
  live?: { quarter: 1 | 2 | 3 | 4; clockTicks: number; score?: [number, number] };
}

export function createRulesState(firstCentrePassTeam: TeamId, opts: RulesStartOptions = {}): RulesState {
  const live = opts.live;
  return {
    phase: live ? 'inPlay' : 'preMatch', quarter: live?.quarter ?? 1, clockTicks: live?.clockTicks ?? 0,
    matchClockTicks: live ? ((live.quarter - 1) * 0 + live.clockTicks) : 0, clockRunning: !!live, waitTicks: 0,
    score: live?.score ? [live.score[0], live.score[1]] : [0, 0], restart: null, ballDead: !live, firstCentrePassTeam,
    attackerTouchInCircle: [false, false], suspensions: [], personalFouls: {}, teamFouls: [0, 0],
    lastRestartTaker: null, pcActive: false, pcFirstShot: null, pcTeam: null,
    psActive: false, psTeam: null, psShotTick: null, pending23: null, lastTouchKind: null, lastTouchInOwnCircle: false,
    pcTakenTick: null,
  };
}

/** Which team takes the centre pass for a quarter. FIH: alternates by quarter (PROVISIONAL reading). */
export function centrePassTeamForQuarter(first: TeamId, quarter: 1 | 2 | 3 | 4): TeamId {
  return quarter % 2 === 1 ? first : otherTeam(first);
}

// ── command gating ────────────────────────────────────────────────────────────

export type GateKind = 'strike' | 'trap' | 'substitute';

/**
 * May this player play the ball / may this substitution happen right now?
 * - Ball dead (setup running): nobody plays it.
 * - Restart ready but not yet taken: only the taking team; PS: only the taker.
 * - Suspended players never play. Substitutions blocked during a PC (except GK — PROVISIONAL: any GK).
 */
export function gateCommand(s: RulesState, view: RulesView, kind: GateKind, playerId: PlayerId, laws: Laws): boolean {
  if (s.phase !== 'inPlay') return kind === 'substitute' && s.phase === 'break';
  const p = view.playerById(playerId);
  if (!p) return false;
  if (kind === 'substitute') {
    if (laws.noSubsDuringPC && s.pcActive && !p.isGoalkeeper) return false;
    return true;
  }
  if (!p.onPitch) return false;
  if (s.ballDead) return false;
  if (s.restart) {
    if (p.team !== s.restart.team) return false;
    if (s.restart.kind === 'penaltyStroke' && s.restart.ps?.takerId !== null && s.restart.ps?.takerId !== playerId) return false;
    if (s.restart.kind === 'penaltyStroke' && kind !== 'strike') return false;
  }
  return true;
}

// ── main step ─────────────────────────────────────────────────────────────────

export function stepRules(s: RulesState, laws: Laws, view: RulesView, sig: TickSignals): Ruling[] {
  const out: Ruling[] = [];
  const t = view.tick;

  // ── phase machine ──────────────────────────────────────────────────────────
  if (s.phase === 'preMatch') {
    startQuarter(s, laws, view, 1, out);
    return out;
  }
  if (s.phase === 'break') {
    if (--s.waitTicks <= 0) startQuarter(s, laws, view, (s.quarter + 1) as 1 | 2 | 3 | 4, out);
    return out;
  }
  if (s.phase === 'fullTime') return out;

  // ── suspensions: reinstate when served (playing-clock based) ───────────────
  for (let i = s.suspensions.length - 1; i >= 0; i--) {
    const su = s.suspensions[i];
    if (su && s.matchClockTicks >= su.untilTick) { s.suspensions.splice(i, 1); out.push({ kind: 'reinstate', playerId: su.playerId }); }
  }

  // ── setup wait for a pending restart (clock stopped) ───────────────────────
  if (s.ballDead) {
    if (s.waitTicks > 0) { s.waitTicks--; return out; }
    // setup done: ball becomes playable for the restart team; clock still stopped until first touch
    s.ballDead = false;
    if (s.restart) s.restart.readyTick = t;
    return out;
  }

  // ── clock ──────────────────────────────────────────────────────────────────
  if (s.clockRunning) { s.clockTicks++; s.matchClockTicks++; }

  // ── restart being taken? ───────────────────────────────────────────────────
  const restart = s.restart;
  const firstTouch = sig.struck[0] ?? null;
  const firstTrap = sig.trapped[0] ?? null;
  let takenThisTick = false;
  if (restart && (firstTouch || firstTrap)) {
    const toucher = firstTouch ?? firstTrap;
    if (toucher?.team === restart.team) {
      s.lastRestartTaker = toucher.playerId;
      takeRestart(s, view, restart, out);
      takenThisTick = true;
    }
  }

  // ── attacker touch inside the circle (the circle rule's memory) ────────────
  for (const st of [...sig.struck, ...sig.trapped]) {
    const e = attackingEnd(st.team);
    const idx = e === -1 ? 0 : 1;
    // Ball position at the moment of the touch ≈ start of tick position (touch happens before integration).
    if (inCircle({ x: sig.ballFrom.x, y: sig.ballFrom.y }, e)) s.attackerTouchInCircle[idx] = true;
  }
  // NB: circle exits are applied AFTER the goal-line check below — the ball "leaves the circle" when it
  // crosses the backline too, and that must not erase the attacker's touch before the goal is judged.

  // ── PC first shot bookkeeping ──────────────────────────────────────────────
  // The injection is not a shot; the first strike by the attackers from inside the circle after it is.
  if (s.pcActive && s.restart === null && s.pcFirstShot === null && !takenThisTick) {
    const e = pcEnd(s);
    const shot = sig.struck.find((st) => st.team === s.pcTeam && e !== 0 && inCircle(st.at, e));
    if (shot) s.pcFirstShot = { struckTick: t, kind: shot.kind };
  }

  // ── fouls from physics signals ─────────────────────────────────────────────
  // Order matters (first foul wins the tick): dangerous play, back-stick, feet, 5 m/23 m breaches.
  const flag = { fouled: false };
  const foul = (f: FoulKind, playerId: PlayerId | null, team: TeamId, at: Vec2, extra?: { stroke?: boolean; card?: CardColour }): void => {
    if (flag.fouled) return;
    flag.fouled = true;
    awardFoul(s, laws, view, f, playerId, team, at, out, extra);
  };

  for (const st of sig.struck) {
    // Back-stick: playing the ball with the rounded side. FIH 9.6.
    if (st.face === 'round') { foul('backStick', st.playerId, st.team, st.at); break; }
    // Dangerous play: a raised ball at an opponent within 5 m above knee height. FIH 9.8/9.9 (PROVISIONAL thresholds).
    if (st.lift > 0.05 || st.kind === 'aerial' || st.kind === 'flick') {
      const raisedAt = opponentInLine(view, st.playerId, st.team, st.at, dmath.atan2(view.ball.vel.y, view.ball.vel.x), laws.dangerRange);
      // A drag flick at goal during a PC is not dangerous per se; a raised hit is judged on danger. Keep the PC first-hit rule separate.
      const heightAtOpp = raisedAt ? projectedHeight(view, raisedAt.dist) : 0;
      if (raisedAt && heightAtOpp > laws.dangerHeight && !(s.pcActive && st.kind === 'flick')) {
        foul('dangerous', st.playerId, st.team, st.at, { card: 'green' });
        break;
      }
    }
  }

  // Tackle contests: a stick tackle is the tackler's offence (FIH 9.13); a carrier backing into the tackler is obstruction (FIH 9.12).
  for (const tk of sig.tackles) {
    if (flag.fouled) break;
    if (tk.outcome === 'foulTackler') foul('stickTackle', tk.tacklerId, tk.tacklerTeam, tk.at);
    else if (tk.outcome === 'foulCarrier') foul('obstruction', tk.carrierId, tk.carrierTeam, tk.at);
  }

  for (const bc of sig.bodyContacts) {
    if (flag.fouled) break;
    const p = view.playerById(bc.playerId);
    if (!p) continue;
    const ownEnd = attackingEnd(otherTeam(p.team)); // the end this player defends
    const inOwnCircle = inCircle({ x: bc.at.x, y: bc.at.y }, ownEnd);
    // Goalkeepers may use their body/pads inside their own circle. FIH 10.2.
    if (p.isGoalkeeper && inOwnCircle) continue;
    // If the ball was raised dangerously *at* this player, the offence is the striker's, not the victim's — already awarded above.
    if (bc.ballHeight > laws.dangerHeight && bc.ballSpeed > 8) continue;
    // Feet/body. Advantage is an umpiring judgement; PROVISIONAL: any body contact by an outfield player is an offence.
    // If a defender's body stops a ball that was going into the goal → penalty stroke (FIH 12.4: intentional/prevents probable goal — PROVISIONAL "would have crossed the goal line inside the goal" heuristic).
    const stroke = inOwnCircle && !p.isGoalkeeper && ballWasGoalBound(sig, bc.at, ownEnd) && bc.ballSpeed > 3;
    foul('feet', bc.playerId, p.team, { x: bc.at.x, y: bc.at.y }, stroke ? { stroke, card: 'yellow' } : { stroke });
  }

  // 23 m free-hit travel rule: ball entered the circle before travelling 5 m / being touched by another player. PROVISIONAL wording.
  if (!flag.fouled && s.pending23) {
    const p23 = s.pending23;
    const e = attackingEnd(p23.team);
    for (const ce of sig.circleEntries) {
      if (ce.end !== e) continue;
      const travelled = Math.sqrt((sig.ballFrom.x - p23.from.x) ** 2 + (sig.ballFrom.y - p23.from.y) ** 2);
      if (!p23.touchedByOther && travelled < laws.freeHit23TravelDistance) {
        foul('freeHit23Circle', p23.takerId, p23.team, { x: sig.ballFrom.x, y: sig.ballFrom.y });
      }
      s.pending23 = null;
    }
    // any touch by another player satisfies the rule
    for (const st of [...sig.struck, ...sig.trapped]) if (st.playerId !== p23.takerId) s.pending23 = null;
  }

  // ── ball over the lines ────────────────────────────────────────────────────
  if (!flag.fouled) {
    for (const gc of sig.goalLineCrossings) {
      const attTeam = teamDefending(-gc.end as End); // team attacking this end
      const defTeam = teamDefending(gc.end);
      const idx = gc.end === -1 ? 0 : 1;
      if (gc.inGoal) {
        // PC first-hit height: a hit as first shot must cross under 460 mm. FIH 13.3.k.
        if (s.pcActive && s.pcFirstShot?.kind === 'hit' && gc.z > laws.pcFirstHitMaxHeight) {
          endPc(s, out, 'foul');
          awardFoul(s, laws, view, 'pcHighFirstHit', view.ball.lastTouch, attTeam, { x: gc.end * (HALF_LENGTH - 1), y: gc.y }, out);
          break;
        }
        const isStroke = s.psActive;
        // THE CIRCLE RULE: a goal only if an attacker played the ball inside the circle before it crossed. FIH 8.1.
        if (s.attackerTouchInCircle[idx] || isStroke) {
          scoreGoal(s, laws, view, attTeam, gc.end, out);
          break;
        }
        // Not a goal. Who put it over? Attacker from outside the circle → 15 m hit-out; defender → long corner.
        if (view.ball.lastTouchTeam === defTeam) award(s, laws, view, 'longCorner', attTeam, longCornerSpot(gc.end, gc.y), out);
        else award(s, laws, view, 'hitOut', defTeam, hitOutSpot(gc.end, gc.y, laws), out);
        break;
      }
      // Over the backline outside the goal.
      if (s.psActive) { endPs(s, out, false); award(s, laws, view, 'hitOut', defTeam, hitOutSpot(gc.end, 0, laws), out); break; }
      if (view.ball.lastTouchTeam === defTeam) {
        // Defender over own backline: intentionally → PC (FIH 13.3.b); unintentionally → long corner (FIH 7.4.b).
        // PROVISIONAL intent heuristic: a defender's own strike from inside their circle counts as intentional.
        const intentional = s.lastTouchKind === 'stick' && s.lastTouchInOwnCircle;
        if (intentional) awardPc(s, laws, view, attTeam, gc.end, gc.y, out);
        else { if (s.pcActive) endPc(s, out, 'out'); award(s, laws, view, 'longCorner', attTeam, longCornerSpot(gc.end, gc.y), out); }
      } else {
        if (s.pcActive) endPc(s, out, 'out');
        award(s, laws, view, 'hitOut', defTeam, hitOutSpot(gc.end, gc.y, laws), out);
      }
      break;
    }
  }
  if (!flag.fouled && ballLive(s)) {
    for (const sc of sig.sidelineCrossings) {
      // Side-in: free hit to the team that did NOT touch it last, on the sideline where it crossed. FIH 7.3.
      const to = view.ball.lastTouchTeam === null ? 0 : otherTeam(view.ball.lastTouchTeam);
      if (s.pcActive) endPc(s, out, 'out');
      if (s.psActive) endPs(s, out, false);
      award(s, laws, view, 'freeHit', to, { x: Math.max(-HALF_LENGTH + 1, Math.min(HALF_LENGTH - 1, sc.x)), y: sc.side * (HALF_WIDTH - 0.3) }, out);
      break;
    }
  }

  // ── circle exits (after the goal decision — see note above) ─────────────────
  for (const ex of sig.circleExits) s.attackerTouchInCircle[ex.end === -1 ? 0 : 1] = false;

  // ── penalty stroke over without a goal: saved, stopped, or dead (FIH 13.10) → 15 m hit-out to the defence ─
  if (s.psActive && ballLive(s) && s.psShotTick !== null && s.psTeam !== null && !flag.fouled) {
    const defTeam = otherTeam(s.psTeam);
    const savedByDef = [...sig.trapped, ...sig.bodyContacts].some((x) => x.team === defTeam);
    const stopped = sig.stopped || (view.ball.speed < 0.3 && t - s.psShotTick > 10);
    if (savedByDef || stopped || t - s.psShotTick > 60) {
      const e = attackingEnd(s.psTeam);
      endPs(s, out, false);
      award(s, laws, view, 'hitOut', defTeam, hitOutSpot(e, 0, laws), out);
    }
  }

  // ── remember the last touch kind (for the intent heuristic) ────────────────
  const lastStrike = sig.struck[sig.struck.length - 1];
  const lastBody = sig.bodyContacts[sig.bodyContacts.length - 1];
  if (lastStrike) {
    s.lastTouchKind = 'stick';
    s.lastTouchInOwnCircle = inCircle(lastStrike.at, attackingEnd(otherTeam(lastStrike.team)));
  } else if (lastBody) {
    s.lastTouchKind = 'body';
    s.lastTouchInOwnCircle = inCircle({ x: lastBody.at.x, y: lastBody.at.y }, attackingEnd(otherTeam(lastBody.team)));
  }

  // ── PC ends when the ball leaves the circle (cleared) — FIH 13.6 (simplified: leaves circle by > 5 m or defender clears out) ──
  if (s.pcActive && ballLive(s)) {
    const e = pcEnd(s);
    if (e !== 0 && !inCircle({ x: view.ball.pos.x, y: view.ball.pos.y }, e) && Math.abs(e * HALF_LENGTH - e * view.ball.pos.x) > 14.63 + 5) endPc(s, out, 'cleared');
    else if (s.pcTakenTick !== null && s.matchClockTicks - s.pcTakenTick > laws.pcTimeoutTicks) endPc(s, out, 'cleared'); // safeguard
  }

  // ── quarter end ────────────────────────────────────────────────────────────
  // Time expires → quarter ends, unless a PC/PS is in progress (it is completed first). FIH 4.x.
  if (s.clockRunning && s.clockTicks >= laws.quarterTicks && !s.pcActive && !s.psActive && !s.restart) {
    endQuarter(s, laws, out);
  }
  return out;
}

/** Ball in open play (not dead, no restart pending). A function so TS does not narrow across the mutations above. */
const ballLive = (s: RulesState): boolean => !s.ballDead && s.restart === null;

/** Scenario/umpire hook: award a restart from outside the law engine (fixtures, coaching sandbox). */
export function forceAward(s: RulesState, laws: Laws, view: RulesView, kind: 'penaltyCorner' | 'penaltyStroke' | 'longCorner' | 'freeHit', team: TeamId, y: Scalar, x?: Scalar): Ruling[] {
  const out: Ruling[] = [];
  const end = attackingEnd(team);
  if (s.pcActive) endPc(s, out, 'foul');
  if (s.psActive) endPs(s, out, false);
  if (kind === 'penaltyCorner') awardPc(s, laws, view, team, end, y, out);
  else if (kind === 'penaltyStroke') awardPs(s, laws, view, team, end, out);
  else if (kind === 'longCorner') award(s, laws, view, 'longCorner', team, longCornerSpot(end, y), out);
  else award(s, laws, view, 'freeHit', team, { x: x ?? 0, y }, out);
  return out;
}

// ── helpers: quarters ─────────────────────────────────────────────────────────

function startQuarter(s: RulesState, laws: Laws, view: RulesView, q: 1 | 2 | 3 | 4, out: Ruling[]): void {
  s.phase = 'inPlay'; s.quarter = q; s.clockTicks = 0; s.clockRunning = false;
  s.pcActive = false; s.psActive = false; s.pcFirstShot = null; s.pcTeam = null; s.psTeam = null; s.pending23 = null;
  s.attackerTouchInCircle = [false, false];
  const team = centrePassTeamForQuarter(s.firstCentrePassTeam, q);
  out.push({ kind: 'quarterStart', quarter: q, centrePassTeam: team });
  award(s, laws, view, 'centrePass', team, centreSpot(), out);
}

function endQuarter(s: RulesState, laws: Laws, out: Ruling[]): void {
  out.push({ kind: 'quarterEnd', quarter: s.quarter });
  out.push({ kind: 'clock', running: false, reason: 'quarterEnd' });
  s.clockRunning = false; s.ballDead = true; s.restart = null;
  out.push({ kind: 'deadBall', at: { x: 0, y: 0 } });
  if (s.quarter === 4) {
    s.phase = 'fullTime';
    out.push({ kind: 'fullTime', score: [s.score[0], s.score[1]] });
  } else {
    s.phase = 'break';
    s.waitTicks = laws.breakTicks[s.quarter - 1] ?? 0;
  }
}

// ── helpers: restarts ─────────────────────────────────────────────────────────

function award(s: RulesState, laws: Laws, view: RulesView, kind: RestartKind, team: TeamId, at: Vec2, out: Ruling[]): void {
  const setup = kind === 'centrePass' ? laws.setupTicks.centrePass
    : kind === 'penaltyCorner' ? laws.setupTicks.penaltyCorner
    : kind === 'penaltyStroke' ? laws.setupTicks.penaltyStroke : laws.setupTicks.freeHit;
  const restart: Restart = { kind, team, at, readyTick: view.tick + setup };
  s.restart = restart; s.ballDead = true; s.waitTicks = setup;
  s.pending23 = null;
  s.attackerTouchInCircle = [false, false];
  // Clock: stopped for centre pass after a goal, PC and PS setups; runs through ordinary free hits (FIH: time is not stopped for free hits).
  if (kind === 'centrePass' || kind === 'penaltyCorner' || kind === 'penaltyStroke') {
    if (s.clockRunning) out.push({ kind: 'clock', running: false, reason: kind === 'centrePass' ? 'goal' : kind });
    s.clockRunning = false;
  }
  out.push({ kind: 'deadBall', at });
  out.push({ kind: 'restart', restart });
  out.push(...placementsFor(restart, view.players, laws));
}

function awardPc(s: RulesState, laws: Laws, view: RulesView, team: TeamId, end: End, y: Scalar, out: Ruling[]): void {
  if (s.pcActive) endPc(s, out, 'foul');
  s.pcActive = true; s.pcFirstShot = null; s.pcTeam = team; s.pcTakenTick = null;
  out.push({ kind: 'penaltyCornerAwarded', team, end });
  award(s, laws, view, 'penaltyCorner', team, pcSpot(end, y, laws), out);
  if (s.restart) s.restart.pc = { end, injected: false, firstShotTaken: false };
}

function awardPs(s: RulesState, laws: Laws, view: RulesView, team: TeamId, end: End, out: Ruling[]): void {
  if (s.pcActive) endPc(s, out, 'stroke');
  s.psActive = true; s.psTeam = team;
  out.push({ kind: 'penaltyStrokeAwarded', team, end });
  award(s, laws, view, 'penaltyStroke', team, strokeSpot(end), out);
  if (s.restart) s.restart.ps = { end, taken: false, takerId: null };
}

function takeRestart(s: RulesState, view: RulesView, r: Restart, out: Ruling[]): void {
  s.restart = null;
  if (!s.clockRunning) { s.clockRunning = true; out.push({ kind: 'clock', running: true, reason: r.kind === 'centrePass' ? 'quarterStart' : 'resume' }); }
  if (r.kind === 'penaltyCorner') { out.push({ kind: 'penaltyCornerTaken', team: r.team, end: attackingEnd(r.team) }); s.pcTakenTick = s.matchClockTicks; }
  if (r.kind === 'penaltyStroke') { out.push({ kind: 'penaltyStrokeTaken', team: r.team, end: attackingEnd(r.team), scored: false }); s.psShotTick = view.tick; }
  // Free hit in the attacking 23 m: the ball must travel 5 m or be touched before entering the circle. PROVISIONAL.
  if ((r.kind === 'freeHit' || r.kind === 'longCorner') && in23({ x: r.at.x, y: r.at.y }, attackingEnd(r.team))) {
    s.pending23 = { team: r.team, takerId: s.lastRestartTaker ?? -1, from: { x: r.at.x, y: r.at.y }, touchedByOther: false };
  }
}

function endPc(s: RulesState, out: Ruling[], outcome: 'goal' | 'cleared' | 'foul' | 'out' | 'stroke'): void {
  if (!s.pcActive) return;
  const team = s.pcTeam ?? 0;
  s.pcActive = false; s.pcFirstShot = null; s.pcTeam = null;
  out.push({ kind: 'penaltyCornerEnded', team, end: attackingEnd(team), outcome });
}
function endPs(s: RulesState, out: Ruling[], scored: boolean): void {
  if (!s.psActive) return;
  s.psActive = false; s.psShotTick = null;
  const last = [...out].reverse().find((r) => r.kind === 'penaltyStrokeTaken');
  if (last?.kind === 'penaltyStrokeTaken') last.scored = scored;
  else if (scored) out.push({ kind: 'penaltyStrokeTaken', team: s.psTeam ?? 0, end: attackingEnd(s.psTeam ?? 0), scored });
}

function scoreGoal(s: RulesState, laws: Laws, view: RulesView, team: TeamId, end: End, out: Ruling[]): void {
  const fromPC = s.pcActive, fromPS = s.psActive;
  s.score[team]++;
  out.push({ kind: 'goal', team, scorerId: view.ball.lastTouchTeam === team ? view.ball.lastTouch : null, end, fromPC, fromPS });
  if (fromPC) endPc(s, out, 'goal');
  if (fromPS) endPs(s, out, true);
  // Restart: centre pass by the team that conceded. FIH 8.2 / 6.
  const conceding = otherTeam(team);
  award(s, laws, view, 'centrePass', laws.centrePassByConceding ? conceding : team, centreSpot(), out);
}

// ── helpers: fouls & cards ────────────────────────────────────────────────────

function awardFoul(
  s: RulesState, laws: Laws, view: RulesView, f: FoulKind, playerId: PlayerId | null, team: TeamId, at: Vec2, out: Ruling[],
  extra?: { stroke?: boolean; card?: CardColour },
): void {
  const victim = otherTeam(team);
  const ownEnd = attackingEnd(victim);        // the end `team` defends
  const attackEnd = attackingEnd(team);
  const inOwnCircle = inCircle(at, ownEnd);
  const inTheirCircle = inCircle(at, attackEnd);
  const inOwn23 = in23(at, ownEnd);

  let awards: RestartKind; let spot: Vec2 = at;
  if (extra?.stroke) awards = 'penaltyStroke';
  // Offence by a defender inside their own circle → PC. FIH 12.3.a.
  else if (inOwnCircle) awards = 'penaltyCorner';
  // PROVISIONAL: intentional offence by a defender inside their own 23 m → PC (FIH 12.3.b). We can't read intent yet: only for dangerous/back-stick.
  else if (inOwn23 && (f === 'dangerous' || f === 'backStick')) awards = 'penaltyCorner';
  // Offence by an attacker inside the circle they attack → free hit to the defence, taken up to 15 m out (FIH 12.2 / 13.1). We place it at the top of the D line.
  else if (inTheirCircle) { awards = 'freeHit'; spot = { x: attackEnd * (HALF_LENGTH - 15), y: Math.max(-GOAL_HALF_WIDTH * 4, Math.min(GOAL_HALF_WIDTH * 4, at.y)) }; }
  else awards = 'freeHit';

  out.push({ kind: 'foul', foul: f, againstPlayer: playerId, againstTeam: team, at, awards, toTeam: victim });
  s.teamFouls[team]++;
  if (playerId !== null) {
    s.personalFouls[playerId] = (s.personalFouls[playerId] ?? 0) + 1;
    const n = s.personalFouls[playerId] ?? 0;
    // Cards: explicit (dangerous → green, goal-preventing → yellow) or persistent fouling thresholds (umpiring heuristic, PROVISIONAL).
    let colour: CardColour | null = extra?.card ?? null;
    let reason: FoulKind | 'persistent' = f;
    if (!colour && n === laws.persistentFoulYellowAt) { colour = 'yellow'; reason = 'persistent'; }
    else if (!colour && n === laws.persistentFoulGreenAt) { colour = 'green'; reason = 'persistent'; }
    if (colour) issueCard(s, laws, colour, playerId, team, reason, out);
  }

  if (s.pcActive && team === (s.pcTeam ?? -1)) endPc(s, out, 'foul');
  if (s.pcActive && team !== (s.pcTeam ?? -1) && awards !== 'penaltyStroke' && awards !== 'penaltyCorner') endPc(s, out, 'foul');
  if (s.psActive) endPs(s, out, false);

  if (awards === 'penaltyStroke') awardPs(s, laws, view, victim, ownEnd, out);
  else if (awards === 'penaltyCorner') { awardPc(s, laws, view, victim, ownEnd, at.y, out); }
  else award(s, laws, view, awards, victim, spot, out);
}

function issueCard(s: RulesState, laws: Laws, colour: CardColour, playerId: PlayerId, team: TeamId, reason: FoulKind | 'persistent' | 'misconduct', out: Ruling[]): void {
  const dur = colour === 'green' ? laws.cards.green : colour === 'yellow' ? laws.cards.yellow : Infinity;
  const until = colour === 'red' ? Infinity : s.matchClockTicks + dur;
  out.push({ kind: 'card', colour, playerId, team, suspensionTicks: dur, reason });
  // A player already off (or carded again during the same stoppage) is not suspended twice: the existing
  // suspension is extended. PROVISIONAL — a second card while serving one is often a red in practice.
  const existing = s.suspensions.find((x) => x.playerId === playerId);
  if (existing) { existing.untilTick = Math.max(existing.untilTick, until); existing.colour = colour; return; }
  s.suspensions.push({ playerId, team, colour, untilTick: until });
  out.push({ kind: 'suspend', playerId, untilTick: until });
}

// ── helpers: geometry-ish ─────────────────────────────────────────────────────

/** Nearest opponent within `range` of `from` and within ±35° of the strike direction. */
function opponentInLine(view: RulesView, striker: PlayerId, team: TeamId, from: Vec2, dir: Scalar, range: Scalar): { id: PlayerId; dist: Scalar } | null {
  let best: { id: PlayerId; dist: Scalar } | null = null;
  for (const p of view.players) {
    if (!p.onPitch || p.team === team || p.id === striker) continue;
    const dx = p.pos.x - from.x, dy = p.pos.y - from.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > range || d < 0.3) continue;
    const a = Math.abs(dmath.angleDelta(dir, dmath.atan2(dy, dx)));
    if (a > 0.61) continue; // 35°
    if (!best || d < best.dist) best = { id: p.id, dist: d };
  }
  return best;
}

/** Height of the ball when it has travelled `dist` horizontally at its current velocity (no drag). */
function projectedHeight(view: RulesView, dist: Scalar): Scalar {
  const vh = Math.sqrt(view.ball.vel.x ** 2 + view.ball.vel.y ** 2);
  if (vh < 1e-6) return view.ball.pos.z;
  const tt = dist / vh;
  return Math.max(0, view.ball.pos.z + view.ball.vel.z * tt - 0.5 * 9.81 * tt * tt);
}

/** Was the ball, before this contact, heading into the goal at `end`? Straight-line projection from its start-of-tick position. */
function ballWasGoalBound(sig: TickSignals, contact: { x: Scalar; y: Scalar }, end: End): boolean {
  const from = sig.ballFrom;
  const dx = contact.x - from.x, dy = contact.y - from.y;
  if (end * dx <= 1e-6) return false;
  const tToLine = (end * HALF_LENGTH - from.x) / dx;
  const yAtLine = from.y + dy * tToLine;
  return Math.abs(yAtLine) < GOAL_HALF_WIDTH;
}

const pcEnd = (s: RulesState): End | 0 => (s.pcTeam === null ? 0 : attackingEnd(s.pcTeam));
