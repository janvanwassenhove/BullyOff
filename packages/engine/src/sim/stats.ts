/**
 * Per-match statistics from the event log (BRIEF §6 metrics) and aggregation
 * over many matches. Reads the log only (ADR-002). Used by simcli batch runs and
 * tools/calibrate.
 */
import { inCircle } from '@bullyoff/shared';
import type { MatchEvent, MatchLog } from '../events/events.js';

export interface MatchStats {
  seed: number;
  profile: string;
  goals: [number, number];
  pcAwarded: [number, number];
  pcGoals: [number, number];
  psAwarded: [number, number];
  psGoals: [number, number];
  circleEntries: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
  cards: { green: number; yellow: number; red: number };
  fouls: number;
  restarts: number;
  tackles: number;
  substitutions: number;
  ticks: number;
}

const isShot = (e: Extract<MatchEvent, { t: 'BallStruck' }>): boolean =>
  e.x !== undefined && e.y !== undefined && inCircle({ x: e.x, y: e.y }, e.team === 0 ? 1 : -1) && !(e.kind === 'push' && e.speed < 5);

export function matchStats(log: MatchLog): MatchStats {
  const ev = log.events;
  const s: MatchStats = {
    seed: log.header.seed, profile: log.header.profile,
    goals: [0, 0], pcAwarded: [0, 0], pcGoals: [0, 0], psAwarded: [0, 0], psGoals: [0, 0],
    circleEntries: [0, 0], shots: [0, 0], shotsOnTarget: [0, 0],
    cards: { green: 0, yellow: 0, red: 0 }, fouls: 0, restarts: 0, tackles: 0, substitutions: 0, ticks: 0,
  };
  const teamOfId = new Map<number, number>(log.header.playerIds.map((id, i) => [id, log.header.teams[i] ?? 0]));
  const gkIds = new Set<number>();
  // goalkeepers: the id per team with the lowest slot is not knowable from the log; use header order (first of each team)
  const firstOf: [number | null, number | null] = [null, null];
  log.header.playerIds.forEach((id, i) => { const tm = log.header.teams[i] ?? 0; firstOf[tm] ??= id; });
  for (const id of firstOf) if (id !== null) gkIds.add(id);

  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (!e) continue;
    s.ticks = e.tick;
    if (e.t === 'Goal') { s.goals[e.team]++; if (e.fromPC) s.pcGoals[e.team]++; if (e.fromPS) s.psGoals[e.team]++; }
    else if (e.t === 'PenaltyCornerAwarded') s.pcAwarded[e.team]++;
    else if (e.t === 'PenaltyStrokeAwarded') s.psAwarded[e.team]++;
    else if (e.t === 'CircleEntry') {
      // an ATTACKING circle entry: the ball enters the circle the last toucher's team attacks
      // (a ball rolling back into your own D is not a circle entry in any statistician's book)
      const lt = e.lastTouch === null ? -1 : (teamOfId.get(e.lastTouch) ?? -1);
      const attackers = e.end === 1 ? 0 : 1;
      if (lt === attackers) s.circleEntries[attackers]++;
    }
    else if (e.t === 'Card') s.cards[e.colour]++;
    else if (e.t === 'Foul') s.fouls++;
    else if (e.t === 'RestartAwarded') s.restarts++;
    else if (e.t === 'Tackle') s.tackles++;
    else if (e.t === 'Substitution') s.substitutions++;
    else if (e.t === 'BallStruck' && isShot(e)) {
      s.shots[e.team]++;
      // on target: the next relevant event is a goal, a keeper touch, or a crossing inside the goal
      for (let j = i + 1; j < Math.min(ev.length, i + 30); j++) {
        const g = ev[j];
        if (!g) break;
        if (g.t === 'Goal' && g.team === e.team) { s.shotsOnTarget[e.team]++; break; }
        if (g.t === 'GoalLineCrossed' && g.inGoal) { s.shotsOnTarget[e.team]++; break; }
        if (g.t === 'BallTrapped' && gkIds.has(g.playerId) && g.team !== e.team) { s.shotsOnTarget[e.team]++; break; }
        if (g.t === 'BallStruck' || g.t === 'BallDead' || g.t === 'GoalLineCrossed' || g.t === 'SidelineCrossed') break;
      }
    }
  }
  return s;
}

export interface Aggregate {
  profile: string;
  matches: number;
  goalsPerMatch: number;
  drawRate: number;
  homeWinRate: number;
  pcPerMatch: number;
  pcConversion: number;
  pcGoalShare: number;
  psPerMatch: number;
  psConversion: number;
  circleEntriesPerMatch: number;
  shotsPerMatch: number;
  shotsOnTargetShare: number;
  greenPerMatch: number;
  yellowPerMatch: number;
  redPerMatch: number;
  foulsPerMatch: number;
  restartsPerMatch: number;
  tacklesPerMatch: number;
  substitutionsPerMatch: number;
  /** Histogram of goals per team per match, index 0..6 (6 = 6+). */
  teamGoalsHistogram: number[];
  /** Scoreline histogram "h-a" → count. */
  scorelines: Record<string, number>;
}

export function aggregate(all: readonly MatchStats[]): Aggregate {
  const n = all.length || 1;
  const sum = (f: (s: MatchStats) => number): number => all.reduce((a, s) => a + f(s), 0);
  const both = (f: (s: MatchStats) => [number, number]): number => sum((s) => f(s)[0] + f(s)[1]);
  const goals = both((s) => s.goals);
  const pcs = both((s) => s.pcAwarded);
  const pcGoals = both((s) => s.pcGoals);
  const pss = both((s) => s.psAwarded);
  const psGoals = both((s) => s.psGoals);
  const shots = both((s) => s.shots);
  const onT = both((s) => s.shotsOnTarget);
  const hist = new Array<number>(7).fill(0);
  const scorelines: Record<string, number> = {};
  let draws = 0, homeWins = 0;
  for (const s of all) {
    for (const g of s.goals) hist[Math.min(6, g)] = (hist[Math.min(6, g)] ?? 0) + 1;
    const key = `${s.goals[0]}-${s.goals[1]}`;
    scorelines[key] = (scorelines[key] ?? 0) + 1;
    if (s.goals[0] === s.goals[1]) draws++; else if (s.goals[0] > s.goals[1]) homeWins++;
  }
  return {
    profile: all[0]?.profile ?? '?', matches: all.length,
    goalsPerMatch: goals / n, drawRate: draws / n, homeWinRate: homeWins / n,
    pcPerMatch: pcs / n, pcConversion: pcs ? pcGoals / pcs : 0, pcGoalShare: goals ? (pcGoals + psGoals) / goals : 0,
    psPerMatch: pss / n, psConversion: pss ? psGoals / pss : 0,
    circleEntriesPerMatch: both((s) => s.circleEntries) / n,
    shotsPerMatch: shots / n, shotsOnTargetShare: shots ? onT / shots : 0,
    greenPerMatch: sum((s) => s.cards.green) / n, yellowPerMatch: sum((s) => s.cards.yellow) / n, redPerMatch: sum((s) => s.cards.red) / n,
    foulsPerMatch: sum((s) => s.fouls) / n, restartsPerMatch: sum((s) => s.restarts) / n,
    tacklesPerMatch: sum((s) => s.tackles) / n, substitutionsPerMatch: sum((s) => s.substitutions) / n,
    teamGoalsHistogram: hist, scorelines,
  };
}
