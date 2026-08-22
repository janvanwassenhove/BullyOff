/**
 * Season-level advice (the season hub's "FROM THE COACHING STAFF" rail and the
 * player "HOW TO USE HIM/HER" note), derived from the World only — no prose
 * authored here, every item is a key + numbers. Deterministic.
 */
import { ageOf, clubPlayers, overall, type ClubId, type Person, type World } from '@bullyoff/season';
import type { Finding } from './analyse.js';

export interface Advice {
  kind: string;
  /** accent = opportunity, signal = warning, line = scouting note */
  rail: 'accent' | 'signal' | 'line';
  i18nKey: string;
  params: Record<string, string | number>;
  personId?: number;
}

const fullName = (p: Person): string => `${p.first} ${p.last}`;

/** Up to three advisories for the user's club right now. */
export function adviseSeason(w: World, clubId: ClubId): Advice[] {
  const out: Advice[] = [];
  const squad = clubPlayers(w, clubId);
  const youth = clubPlayers(w, clubId, true).filter((p) => p.youth || ageOf(p, w.year) <= 21);
  // 1. the young player developing fastest who is not getting minutes
  const prospects = youth
    .filter((p) => p.attrs.hidden.potential - overall(p) >= 3 && p.injuredDays === 0)
    .sort((a, b) => (b.attrs.hidden.potential - overall(b)) - (a.attrs.hidden.potential - overall(a)) || a.id - b.id);
  const prospect = prospects[0];
  if (prospect) out.push({ kind: 'youthMinutes', rail: 'accent', i18nKey: 'advice.youthMinutes', params: { name: fullName(prospect), age: ageOf(prospect, w.year), minutes: prospect.minutes }, personId: prospect.id });
  // 2. legs: a full-court press with a thin bench
  const club = w.clubs[clubId];
  if (club?.tactics.press === 'full' && squad.length <= 19) out.push({ kind: 'pressLegs', rail: 'signal', i18nKey: 'advice.pressLegs', params: { squad: squad.length } });
  // 3. the next opponent's penalty-corner rate
  const next = w.season.fixtures.filter((f) => !f.played && (f.home === clubId || f.away === clubId)).sort((a, b) => a.day - b.day)[0];
  if (next) {
    const oppId = next.home === clubId ? next.away : next.home;
    const played = w.season.fixtures.filter((f) => f.played && f.stats && (f.home === oppId || f.away === oppId));
    let pcs = 0, pcGoals = 0, goals = 0, conceded = 0;
    for (const f of played) {
      const s = f.stats; if (!s) continue;
      const i = f.home === oppId ? 0 : 1;
      pcs += s.pcAwarded[i]; pcGoals += s.pcGoals[i]; goals += s.goals[i]; conceded += s.goals[i === 0 ? 1 : 0];
    }
    const opp = w.clubs[oppId];
    if (opp && played.length > 0) {
      const rate = pcs > 0 ? Math.round((100 * pcGoals) / pcs) : 0;
      out.push({ kind: 'nextOpponent', rail: 'line', i18nKey: rate >= 30 ? 'advice.nextOpponentPc' : 'advice.nextOpponent', params: { club: opp.name, away: next.away === clubId ? 1 : 0, rate, goals, conceded, played: played.length } });
    }
  }
  // 4. treatment room pressure
  const injured = clubPlayers(w, clubId, true).filter((p) => p.injuredDays > 0);
  if (injured.length >= 3) out.push({ kind: 'treatmentRoom', rail: 'signal', i18nKey: 'advice.treatmentRoom', params: { n: injured.length } });
  return out.slice(0, 3);
}

/** The per-player coaching read: what the attributes say about how to use them, plus a suggestion chip. */
export function playerRead(p: Person): { i18nKey: string; params: Record<string, string | number>; suggest: string | null; drill: string | null } {
  const a = p.attrs;
  // the read quotes numbers on the same 0–100 scale as the attribute bars next to it; thresholds stay on the 1–20 model scale
  const s = (v: number): number => Math.round((v / 20) * 100);
  if (p.role === 'GK') {
    const reflex = a.goalkeeper.reflexes, one = a.goalkeeper.oneOnOne;
    return { i18nKey: reflex >= one + 3 ? 'read.gkReflex' : one >= reflex + 3 ? 'read.gkOneOnOne' : 'read.gkBalanced', params: { reflex: s(reflex), one: s(one) }, suggest: null, drill: 'drill.gkFlicks' };
  }
  const pace = a.physical.acceleration + a.physical.pace, stick = a.technical.elimination + a.technical.firstTouch;
  const hit = a.technical.hit, flick = a.technical.dragFlick, aerial = a.technical.skills3d, tackle = a.technical.tackling, vision = a.mental.vision, work = a.mental.workRate;
  if (p.role === 'FWD') {
    if (pace >= 30 && stick >= 26) return { i18nKey: 'read.fwdBaseline', params: { pace: s(pace / 2), stick: s(stick / 2), goals: p.goals }, suggest: 'suggest.buildUpWide', drill: 'drill.baseline2v1' };
    if (hit >= 15) return { i18nKey: 'read.fwdFinisher', params: { hit: s(hit), goals: p.goals }, suggest: 'suggest.buildUpMiddle', drill: 'drill.topOfD' };
    return { i18nKey: 'read.fwdWorker', params: { work: s(work), goals: p.goals }, suggest: 'suggest.pressFull', drill: 'drill.leadRuns' };
  }
  if (p.role === 'MID') {
    if (vision >= 14) return { i18nKey: 'read.midPlaymaker', params: { vision: s(vision) }, suggest: 'suggest.buildUpMiddle', drill: 'drill.outletPatterns' };
    if (aerial >= 13) return { i18nKey: 'read.midAerial', params: { aerial: s(aerial) }, suggest: 'suggest.buildUpDirect', drill: 'drill.aerialReceive' };
    return { i18nKey: 'read.midEngine', params: { work: s(work), stamina: s(a.physical.stamina) }, suggest: 'suggest.rotateLater', drill: 'drill.pressTriggers' };
  }
  // DEF
  if (flick >= 14) return { i18nKey: 'read.defFlicker', params: { flick: s(flick) }, suggest: 'suggest.pcStriker', drill: 'drill.dragFlick' };
  if (tackle >= 14) return { i18nKey: 'read.defStopper', params: { tackle: s(tackle) }, suggest: 'suggest.markRunner', drill: 'drill.channelTackle' };
  return { i18nKey: 'read.defOutlet', params: { push: s(a.technical.push) }, suggest: 'suggest.buildUpWide', drill: 'drill.outletPatterns' };
}

/** Attribute rows for the player card (0–100 scale the design renders). */
export function attributeRows(p: Person): { key: string; value: number }[] {
  const a = p.attrs; const s = (v: number): number => Math.round((v / 20) * 100);
  if (p.role === 'GK') {
    return [['reflexes', a.goalkeeper.reflexes], ['positioning', a.goalkeeper.positioning], ['oneOnOne', a.goalkeeper.oneOnOne], ['pace', a.physical.pace], ['composure', a.mental.composure], ['decisions', a.mental.decisions]].map(([k, v]) => ({ key: String(k), value: s(Number(v)) }));
  }
  return [['acceleration', a.physical.acceleration], ['topSpeed', a.physical.pace], ['stickSkill', a.technical.elimination], ['hit', a.technical.hit], ['aerial', a.technical.skills3d], ['workRate', a.mental.workRate], ['dragFlick', a.technical.dragFlick]].map(([k, v]) => ({ key: String(k), value: s(Number(v)) }));
}

/** Findings with a rule key get a rulebook link; expose the keys the rulebook must cover. */
export const RULE_KEYS = ['rules.feet', 'rules.dangerous', 'rules.backStick', 'rules.obstruction', 'rules.stickTackle', 'rules.freeHitDistance', 'rules.selfPass23', 'rules.pcBreach', 'rules.pcFirstHit', 'rules.stroke', 'rules.circle', 'rules.pc', 'rules.cards', 'rules.subs', 'rules.aerial'] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export const isFinding = (x: unknown): x is Finding => typeof x === 'object' && x !== null && 'i18nKey' in x;
