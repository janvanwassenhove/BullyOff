/**
 * The match analyser (design handoff § State management → `packages/insight`).
 *
 * `analyse(log, instructions, coachTeam)` → `Finding[]`: typed, deterministic facts
 * read off the event log, the frames and the coach's tick-stamped instructions.
 * Never a rendered string — every finding carries an i18n key + params so NL/EN/FR
 * all work and the UI stays dumb. Same log ⇒ same findings (the log is the only
 * input and nothing here is random). If nothing is confident, return fewer
 * findings rather than filler.
 */
import { FRAME_PLAYER_STRIDE, TICK_HZ, quarterStats, type CoachInstruction, type MatchEvent, type MatchLog } from '@bullyoff/engine';
import { HALF_LENGTH, LINE_23_X, inCircle } from '@bullyoff/shared';
import type { FoulKind } from '@bullyoff/rules';

export type Severity = 'good' | 'decision' | 'mistake' | 'info';
export type Section = 'well' | 'lesson' | 'rule' | 'moment' | 'coachRead' | 'phase';

export interface Finding {
  kind: string;
  section: Section;
  severity: Severity;
  /** Tick the finding is anchored at (moments: the thing that happened; effects: the instruction). */
  tick: number;
  tickRange?: [number, number];
  /** Raw numbers behind the claim (also what the UI renders as evidence). */
  metrics: Record<string, number>;
  /** Message key under `insight.*` plus params for vue-i18n. */
  i18nKey: string;
  params: Record<string, string | number>;
  /** For rule findings: the FIH rule key under `rules.*`. */
  ruleKey?: string;
}

export interface AnalyseOptions {
  /** Only consider events up to this tick (live coach read). Default: whole log. */
  upToTick?: number;
  /** Names for player ids (local engine ids) — surfaced in params; never required. */
  names?: Record<number, string>;
}

const MIN = 60 * TICK_HZ;
const clockOf = (tick: number): string => { const s = Math.floor(tick / TICK_HZ); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const attackingEnd = (team: 0 | 1): 1 | -1 => (team === 0 ? 1 : -1);

/** Attacking circle entries (attacker's touch carried the ball in) per team, with ticks. */
function entries(log: MatchLog, teamOf: Map<number, number>): { tick: number; team: number }[] {
  const out: { tick: number; team: number }[] = [];
  for (const e of log.events) {
    if (e.t !== 'CircleEntry') continue;
    const lt = e.lastTouch === null ? -1 : (teamOf.get(e.lastTouch) ?? -1);
    const att = e.end === 1 ? 0 : 1;
    if (lt === att) out.push({ tick: e.tick, team: att });
  }
  return out;
}
const isShot = (e: Extract<MatchEvent, { t: 'BallStruck' }>): boolean =>
  e.x !== undefined && e.y !== undefined && inCircle({ x: e.x, y: e.y }, e.team === 0 ? 1 : -1) && !(e.kind === 'push' && e.speed < 5);

export function analyse(log: MatchLog, instructions: readonly CoachInstruction[], coachTeam: 0 | 1, opts: AnalyseOptions = {}): Finding[] {
  const upTo = opts.upToTick ?? Number.POSITIVE_INFINITY;
  const ev = log.events.filter((e) => e.tick <= upTo);
  const teamOf = new Map<number, number>(log.header.playerIds.map((id, i) => [id, log.header.teams[i] ?? 0]));
  const them: 0 | 1 = coachTeam === 0 ? 1 : 0;
  const out: Finding[] = [];
  const name = (id: number | null): string => (id === null ? '' : (opts.names?.[id] ?? `#${id}`));
  const ents = entries({ ...log, events: ev }, teamOf);
  const shots = ev.filter((e): e is Extract<MatchEvent, { t: 'BallStruck' }> => e.t === 'BallStruck' && isShot(e));
  const goals = ev.filter((e): e is Extract<MatchEvent, { t: 'Goal' }> => e.t === 'Goal');
  const lastTick = ev[ev.length - 1]?.tick ?? 0;

  // ── 1. the effect of each tactics switch (build-up / press / formation / mentality) ──
  const switches = instructions.filter((i): i is Extract<CoachInstruction, { kind: 'tactics' }> => i.kind === 'tactics' && i.team === coachTeam && i.tick <= upTo
    && ('buildUp' in i.patch || 'press' in i.patch || 'formation' in i.patch || 'mentality' in i.patch));
  for (const sw of switches) {
    const before = Math.max(0, sw.tick - 10 * MIN), after = Math.min(lastTick, sw.tick + 10 * MIN);
    if (sw.tick - before < 3 * MIN || after - sw.tick < 3 * MIN) continue; // not enough play either side to say anything
    const rate = (from: number, to: number, list: { tick: number; team: number }[]): number => list.filter((x) => x.team === coachTeam && x.tick >= from && x.tick < to).length / ((to - from) / MIN);
    const entB = rate(before, sw.tick, ents), entA = rate(sw.tick, after, ents);
    const shB = rate(before, sw.tick, shots), shA = rate(sw.tick, after, shots);
    const goalsA = goals.filter((g) => g.team === coachTeam && g.tick >= sw.tick && g.tick < after).length;
    const what = 'buildUp' in sw.patch ? `buildUp.${sw.patch.buildUp ?? ''}` : 'press' in sw.patch ? `press.${sw.patch.press ?? ''}` : 'formation' in sw.patch ? `formation.${sw.patch.formation ?? ''}` : `mentality.${sw.patch.mentality ?? ''}`;
    const improved = shA > shB * 1.3 + 0.05 || (entA > entB * 1.3 + 0.05 && shA >= shB);
    const worse = shA < shB * 0.7 - 0.05 && entA <= entB;
    if (!improved && !worse) continue;
    out.push({
      kind: 'tacticsSwitch', section: improved ? 'well' : 'lesson', severity: improved ? 'good' : 'mistake', tick: sw.tick, tickRange: [before, after],
      metrics: { entriesBefore: Math.round(entB * 10) / 10, entriesAfter: Math.round(entA * 10) / 10, shotsBefore: Math.round(shB * 10) / 10, shotsAfter: Math.round(shA * 10) / 10, goalsAfter: goalsA },
      i18nKey: improved ? 'insight.switchWorked' : 'insight.switchFailed',
      params: { clock: clockOf(sw.tick), what, entriesBefore: Math.round(entB * 10) / 10, entriesAfter: Math.round(entA * 10) / 10, shotsBefore: Math.round(shB * 10) / 10, shotsAfter: Math.round(shA * 10) / 10, goals: goalsA },
    });
  }

  // ── 2. free hits conceded inside our own 23 and how many became penalty corners ──
  const ownEnd = attackingEnd(them); // the end we defend
  const fouls = ev.filter((e): e is Extract<MatchEvent, { t: 'Foul' }> => e.t === 'Foul' && e.againstTeam === coachTeam && e.x * ownEnd > LINE_23_X);
  if (fouls.length >= 2) {
    const pcs = ev.filter((e): e is Extract<MatchEvent, { t: 'PenaltyCornerAwarded' }> => e.t === 'PenaltyCornerAwarded' && e.team === them);
    const became = fouls.filter((f) => pcs.some((p) => p.tick >= f.tick && p.tick <= f.tick + 30 * TICK_HZ)).length;
    out.push({ kind: 'ownFreeHits', section: 'lesson', severity: 'mistake', tick: fouls[0]?.tick ?? 0, metrics: { fouls: fouls.length, pcs: became },
      i18nKey: 'insight.ownFreeHits', params: { n: fouls.length, pcs: became } });
  }

  // ── 3. third-quarter legs: starters below 40 % stamina before the last break ──
  const q3End = ev.find((e) => e.t === 'QuarterEnd' && e.quarter === 3);
  if (q3End && log.frames.length) {
    const f = [...log.frames].reverse().find((fr) => fr.tick <= q3End.tick);
    if (f) {
      let tired = 0, mine = 0;
      log.header.playerIds.forEach((id, i) => {
        if (teamOf.get(id) !== coachTeam) return;
        const y = f.players[i * FRAME_PLAYER_STRIDE + 1] ?? 0;
        if (Math.abs(y) > 29) return; // bench
        mine++;
        if ((f.players[i * FRAME_PLAYER_STRIDE + 6] ?? 1) < 0.4) tired++;
      });
      if (mine > 0 && tired >= 3) out.push({ kind: 'thirdQuarterLegs', section: 'lesson', severity: 'mistake', tick: q3End.tick, metrics: { tired, onPitch: mine }, i18nKey: 'insight.thirdQuarterLegs', params: { n: tired } });
    }
  }

  // ── 4. aerials: how many of ours were received by us ──
  const aerials = ev.map((e, i) => ({ e, i })).filter(({ e }) => e.t === 'BallStruck' && e.kind === 'aerial' && e.team === coachTeam);
  if (aerials.length >= 4) {
    let won = 0;
    for (const { i } of aerials) {
      for (let j = i + 1; j < Math.min(ev.length, i + 40); j++) {
        const g = ev[j]; if (!g) break;
        if (g.t === 'BallTrapped' || (g.t === 'BallStruck' && g.tick > (ev[i]?.tick ?? 0) + 10)) { if (g.team === coachTeam) won++; break; }
      }
    }
    const lost = aerials.length - won;
    if (lost / aerials.length >= 0.6) out.push({ kind: 'aerialsLost', section: 'lesson', severity: 'mistake', tick: aerials[0]?.e.tick ?? 0, metrics: { aerials: aerials.length, lost }, i18nKey: 'insight.aerialsLost', params: { lost, n: aerials.length, surface: log.header.surface } });
  }

  // ── 5. penalty-corner battery ──
  const pcFor = ev.filter((e) => e.t === 'PenaltyCornerAwarded' && e.team === coachTeam).length;
  const pcGoals = goals.filter((g) => g.team === coachTeam && g.fromPC).length;
  if (pcFor >= 4 && pcGoals === 0) out.push({ kind: 'pcBattery', section: 'lesson', severity: 'mistake', tick: lastTick, metrics: { pcs: pcFor, goals: pcGoals }, i18nKey: 'insight.pcBattery', params: { n: pcFor } });
  if (pcFor >= 2 && pcGoals >= 2) out.push({ kind: 'pcBatteryGood', section: 'well', severity: 'good', tick: lastTick, metrics: { pcs: pcFor, goals: pcGoals }, i18nKey: 'insight.pcBatteryGood', params: { goals: pcGoals, n: pcFor } });

  // ── 6. key moments: goals (with their cause), PCs won, cards ──
  for (const g of goals) {
    const ours = g.team === coachTeam;
    // what preceded: our foul / lost tackle in the 30 s before a goal against
    const window = ev.filter((e) => e.tick >= g.tick - 30 * TICK_HZ && e.tick < g.tick);
    const ownFoul = !ours && window.find((e): e is Extract<MatchEvent, { t: 'Foul' }> => e.t === 'Foul' && e.againstTeam === coachTeam);
    const lostTackle = !ours && window.find((e): e is Extract<MatchEvent, { t: 'Tackle' }> => e.t === 'Tackle' && e.tacklerTeam === coachTeam && e.outcome === 'lost');
    const pc = g.fromPC, ps = g.fromPS;
    const key = ours ? (pc ? 'insight.momentGoalPc' : ps ? 'insight.momentGoalPs' : 'insight.momentGoal') : ownFoul ? 'insight.momentConcededFoul' : lostTackle ? 'insight.momentConcededTackle' : pc ? 'insight.momentConcededPc' : 'insight.momentConceded';
    out.push({ kind: 'goal', section: 'moment', severity: ours ? 'good' : 'mistake', tick: g.tick, metrics: { home: g.score[0], away: g.score[1] },
      i18nKey: key, params: { clock: clockOf(g.tick), scorer: name(g.scorerId), score: `${g.score[0]}–${g.score[1]}`, foul: ownFoul ? ownFoul.foul : '' }, ...(ownFoul ? { ruleKey: ruleFor(ownFoul.foul) } : {}) });
  }
  for (const e of ev) {
    if (e.t === 'PenaltyCornerAwarded' && e.team === coachTeam) {
      const variant = instructions.filter((i): i is Extract<CoachInstruction, { kind: 'tactics' }> => i.kind === 'tactics' && i.team === coachTeam && i.tick <= e.tick + 8 * TICK_HZ && 'pcVariant' in i.patch).pop();
      out.push({ kind: 'pcWon', section: 'moment', severity: 'decision', tick: e.tick, metrics: {}, i18nKey: 'insight.momentPcWon', params: { clock: clockOf(e.tick), variant: variant?.patch.pcVariant ? `pc.${variant.patch.pcVariant}` : '' } });
    }
    if (e.t === 'Card' && e.team === coachTeam) out.push({ kind: 'card', section: 'moment', severity: 'mistake', tick: e.tick, metrics: { minutes: Math.round(e.suspensionTicks / MIN) }, i18nKey: 'insight.momentCard', params: { clock: clockOf(e.tick), colour: e.colour, player: name(e.playerId), reason: e.reason } });
  }

  // ── 7. rule of the match: the foul the match turned on ──
  const foulCount = new Map<FoulKind, number>();
  for (const e of ev) if (e.t === 'Foul') foulCount.set(e.foul, (foulCount.get(e.foul) ?? 0) + 1);
  const top = [...foulCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (top && top[1] >= 2) out.push({ kind: 'ruleOfTheMatch', section: 'rule', severity: 'info', tick: lastTick, metrics: { count: top[1] }, i18nKey: 'insight.rule', params: { n: top[1], foul: top[0] }, ruleKey: ruleFor(top[0]) });

  // ── 8. the live coach read (last four minutes) ──
  if (Number.isFinite(upTo)) {
    const from = upTo - 4 * MIN;
    const recentEntries = ents.filter((x) => x.team === coachTeam && x.tick >= from).length;
    const recentShots = shots.filter((s) => s.team === coachTeam && s.tick >= from).length;
    if (recentEntries >= 3 && recentShots === 0) out.push({ kind: 'readNoShots', section: 'coachRead', severity: 'decision', tick: upTo, metrics: { entries: recentEntries }, i18nKey: 'insight.readNoShots', params: { n: recentEntries } });
    const theirEntries = ents.filter((x) => x.team === them && x.tick >= from).length;
    if (theirEntries >= 3 && recentEntries === 0) out.push({ kind: 'readUnderSiege', section: 'coachRead', severity: 'decision', tick: upTo, metrics: { entries: theirEntries }, i18nKey: 'insight.readUnderSiege', params: { n: theirEntries } });
    const lastPc = [...ev].reverse().find((e): e is Extract<MatchEvent, { t: 'PenaltyCornerAwarded' }> => e.t === 'PenaltyCornerAwarded');
    if (lastPc?.team === coachTeam && upTo - lastPc.tick < 12 * TICK_HZ) {
      out.push({ kind: 'readPc', section: 'coachRead', severity: 'decision', tick: lastPc.tick, metrics: {}, i18nKey: 'insight.readPc', params: { clock: clockOf(lastPc.tick) } });
    }
  }

  // ── 9. the phase of play (engine view): where the ball is and what that asks ──
  const lastFrame = log.frames.length ? [...log.frames].reverse().find((f) => f.tick <= upTo) : undefined;
  if (lastFrame) {
    const bx = lastFrame.ball[0] ?? 0;
    const myEnd = attackingEnd(coachTeam);
    const zone = bx * myEnd > LINE_23_X ? 'attack23' : bx * myEnd < -LINE_23_X ? 'defend23' : 'middle';
    const q = quarterStats({ ...log, events: ev });
    const cur = q[q.length - 1];
    out.push({ kind: 'phase', section: 'phase', severity: 'info', tick: lastFrame.tick, metrics: { x: Math.round(bx * myEnd + HALF_LENGTH), possession: cur ? Math.round(cur.possession[coachTeam] * 100) : 50 },
      i18nKey: `insight.phase.${zone}`, params: { metres: Math.round(bx * myEnd + HALF_LENGTH), possession: cur ? Math.round(cur.possession[coachTeam] * 100) : 50 } });
  }

  return out.sort((a, b) => a.tick - b.tick || a.kind.localeCompare(b.kind));
}

/** FIH rule key for a foul kind (the "rule of the match" card and the rulebook deep link). */
export function ruleFor(foul: FoulKind): string {
  switch (foul) {
    case 'feet': return 'rules.feet';
    case 'dangerous': return 'rules.dangerous';
    case 'backStick': return 'rules.backStick';
    case 'obstruction': return 'rules.obstruction';
    case 'stickTackle': return 'rules.stickTackle';
    case 'freeHitDistance': return 'rules.freeHitDistance';
    case 'freeHit23Circle': return 'rules.selfPass23';
    case 'pcBreach': return 'rules.pcBreach';
    case 'pcHighFirstHit': return 'rules.pcFirstHit';
    case 'earlyStroke': return 'rules.stroke';
  }
}

/** Circle entries per five-minute bucket, ours and theirs (the momentum strip). 16 buckets over 4 × 15 min + 10 min of stoppage room. */
export function momentum(log: MatchLog, coachTeam: 0 | 1, buckets = 16): { us: number; them: number }[] {
  const teamOf = new Map<number, number>(log.header.playerIds.map((id, i) => [id, log.header.teams[i] ?? 0]));
  const ents = entries(log, teamOf);
  const last = log.events[log.events.length - 1]?.tick ?? 1;
  const width = Math.max(1, Math.ceil(last / buckets));
  const out = Array.from({ length: buckets }, () => ({ us: 0, them: 0 }));
  for (const e of ents) { const b = Math.min(buckets - 1, Math.floor(e.tick / width)); const slot = out[b]; if (slot) { if (e.team === coachTeam) slot.us++; else slot.them++; } }
  return out;
}

/** Match-sheet rows for the report, ours first (derived from the log only). */
export function matchSheet(log: MatchLog, coachTeam: 0 | 1): { key: string; us: number | string; them: number | string; usN: number; themN: number }[] {
  const teamOf = new Map<number, number>(log.header.playerIds.map((id, i) => [id, log.header.teams[i] ?? 0]));
  const ents = entries(log, teamOf);
  const ev = log.events;
  const count = (pred: (e: MatchEvent) => boolean): number => ev.filter(pred).length;
  const tot = (a: number, b: number): [number, number] => [a, b];
  const them: 0 | 1 = coachTeam === 0 ? 1 : 0;
  const touches = tot(count((e) => (e.t === 'BallStruck' || e.t === 'BallTrapped') && e.team === coachTeam), count((e) => (e.t === 'BallStruck' || e.t === 'BallTrapped') && e.team === them));
  const possU = Math.round((100 * touches[0]) / Math.max(1, touches[0] + touches[1]));
  const rows = [
    { key: 'goals', ...pair(count((e) => e.t === 'Goal' && e.team === coachTeam), count((e) => e.t === 'Goal' && e.team === them)) },
    { key: 'shots', ...pair(count((e) => e.t === 'BallStruck' && isShot(e) && e.team === coachTeam), count((e) => e.t === 'BallStruck' && isShot(e) && e.team === them)) },
    { key: 'circleEntries', ...pair(ents.filter((x) => x.team === coachTeam).length, ents.filter((x) => x.team === them).length) },
    { key: 'penaltyCorners', ...pair(count((e) => e.t === 'PenaltyCornerAwarded' && e.team === coachTeam), count((e) => e.t === 'PenaltyCornerAwarded' && e.team === them)) },
    { key: 'possession', us: `${possU} %`, them: `${100 - possU} %`, usN: possU, themN: 100 - possU },
    { key: 'tacklesWon', ...pair(count((e) => e.t === 'Tackle' && e.tacklerTeam === coachTeam && e.outcome === 'won'), count((e) => e.t === 'Tackle' && e.tacklerTeam === them && e.outcome === 'won')) },
    { key: 'cards', ...pair(count((e) => e.t === 'Card' && e.team === coachTeam), count((e) => e.t === 'Card' && e.team === them)) },
    { key: 'fouls', ...pair(count((e) => e.t === 'Foul' && e.againstTeam === coachTeam), count((e) => e.t === 'Foul' && e.againstTeam === them)) },
  ];
  return rows;
}
const pair = (a: number, b: number): { us: number; them: number; usN: number; themN: number } => ({ us: a, them: b, usN: a, themN: b });
