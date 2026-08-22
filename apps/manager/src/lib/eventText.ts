/** Localised one-liners for match events (engine view log, coach log, report). Keys under sim.ev.* */
import { TICK_HZ, type MatchEvent } from '@bullyoff/engine';

export const clockOf = (tick: number): string => {
  const s = Math.floor(tick / TICK_HZ);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export type Tr = (key: string, params?: Record<string, unknown>) => string;

/** Events worth a line in a log (the rest is physics). */
export const LOGGED: MatchEvent['t'][] = ['Goal', 'PenaltyCornerAwarded', 'PenaltyStrokeAwarded', 'Card', 'Substitution', 'QuarterStart', 'QuarterEnd', 'FullTime', 'Foul'];

export function eventLine(e: MatchEvent, t: Tr, shorts: [string, string] = ['HOME', 'AWAY'], names: Record<number, string> = {}): { text: string; colour: string } | null {
  const team = (i: number): string => (i === 0 ? shorts[0] : shorts[1]);
  switch (e.t) {
    case 'Goal': return { text: t('sim.ev.Goal', { team: team(e.team), score: `${e.score[0]}–${e.score[1]}` }) + (e.scorerId !== null && names[e.scorerId] ? ` ${names[e.scorerId]}.` : ''), colour: 'var(--accent-soft)' };
    case 'PenaltyCornerAwarded': return { text: t('sim.ev.PenaltyCornerAwarded', { team: team(e.team) }), colour: 'var(--signal)' };
    case 'PenaltyStrokeAwarded': return { text: t('sim.ev.PenaltyStrokeAwarded', { team: team(e.team) }), colour: 'var(--signal)' };
    case 'Card': return { text: t('sim.ev.Card', { colour: t('sim.card.' + e.colour), team: team(e.team), id: names[e.playerId] ?? '#' + String(e.playerId) }), colour: 'var(--fg-muted)' };
    case 'Substitution': return { text: t('sim.ev.Substitution', { team: team(e.team) }) + (names[e.inId] ? ` ${names[e.inId]} ↔ ${names[e.outId] ?? ''}` : ''), colour: 'var(--fg-muted)' };
    case 'QuarterStart': return { text: t('sim.ev.QuarterStart', { q: e.quarter }), colour: 'var(--fg-2)' };
    case 'QuarterEnd': return { text: t('sim.ev.QuarterEnd', { q: e.quarter }), colour: 'var(--fg-2)' };
    case 'FullTime': return { text: t('sim.ev.FullTime'), colour: 'var(--fg)' };
    case 'Foul': return { text: t('sim.ev.Foul', { team: team(e.toTeam), foul: t('insight.foul.' + e.foul) }), colour: 'var(--fg-muted)' };
    default: return null;
  }
}
