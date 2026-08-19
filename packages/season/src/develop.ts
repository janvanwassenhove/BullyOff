/**
 * Player development and decline at the season roll-over (BRIEF §5.3, Phase 6).
 * The amateur-hockey shape: growth to ~24 towards `potential`, plateau, decline
 * from ~30; `lifePressure` (studies at 17–18, work/family mid-20s) causes real
 * drop-off and early retirement; injuries and facilities modulate. Youth players
 * graduate to the first squad; new intake arrives every year. Deterministic.
 */
import { Rng, clamp } from '@bullyoff/shared';
import type { Attributes } from '@bullyoff/engine';
import type { Person, World } from './model.js';
import { ageOf, makePerson } from './world.js';

const GROUPS: (keyof Omit<Attributes, 'hidden'>)[] = ['technical', 'physical', 'mental', 'goalkeeper'];

/** Mean level of a player's relevant attributes. */
export function overall(p: Person): number {
  const a = p.attrs;
  const nums = (o: object): number[] => Object.values(o as Record<string, number>);
  const vals: number[] = p.role === 'GK' ? nums(a.goalkeeper) : [...nums(a.technical), ...nums(a.physical), ...nums(a.mental)];
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/** Shift all attributes of a group by delta (rounded per attribute, deterministic rounding). */
function shift(p: Person, group: keyof Omit<Attributes, 'hidden'>, delta: number, rng: Rng): void {
  const g = p.attrs[group] as unknown as Record<string, number>;
  for (const k of Object.keys(g)) {
    const v = g[k] ?? 10;
    const frac = delta - Math.trunc(delta);
    const d = Math.trunc(delta) + (rng.next() < Math.abs(frac) ? Math.sign(delta) : 0);
    g[k] = clamp(v + d, 1, 20);
  }
}

export interface DevelopmentReport { grew: number; declined: number; retired: number; graduated: number; intake: number }

export function developSeason(w: World, facilitiesOf: (club: string | null) => number): DevelopmentReport {
  const rng = new Rng(w.seed, 9000 + w.year);
  const rep: DevelopmentReport = { grew: 0, declined: 0, retired: 0, graduated: 0, intake: 0 };
  for (const p of Object.values(w.persons)) {
    if (p.retired) continue;
    const age = ageOf(p, w.year);
    const pot = p.attrs.hidden.potential;
    const cur = overall(p);
    const fac = (facilitiesOf(p.club) - 3) * 0.15; // 1..5 → −0.3..+0.3
    const coach = (p.attrs.hidden.coachability - 10) * 0.03;
    const life = (p.attrs.hidden.lifePressure - 10) * 0.05;
    let delta = 0;
    if (age < 24) delta = clamp((pot - cur) * 0.35, 0, 2.2) + fac + coach - Math.max(0, life);
    else if (age < 30) delta = clamp((pot - cur) * 0.15, -0.3, 0.6) + fac * 0.5 - Math.max(0, life) * 0.5;
    else delta = -0.35 - (age - 30) * 0.12 + fac * 0.3 - Math.max(0, life) * 0.3;
    delta += rng.gaussian(0, 0.25);
    if (p.role === 'GK') shift(p, 'goalkeeper', delta, rng);
    for (const g of GROUPS) if (g !== 'goalkeeper' || p.role !== 'GK') shift(p, g, delta * (g === 'physical' && age > 30 ? 1.4 : 1), rng);
    if (delta > 0.2) rep.grew++; else if (delta < -0.2) rep.declined++;

    // life pressure evolves: studies end (~19–22), work/family arrives (~25–28)
    const lp = p.attrs.hidden.lifePressure;
    if (age === 18) p.attrs.hidden.lifePressure = clamp(lp + rng.int(3), 1, 20);
    if (age === 22) p.attrs.hidden.lifePressure = clamp(lp - 3 + rng.int(3), 1, 20);
    if (age === 26) p.attrs.hidden.lifePressure = clamp(lp + 2 + rng.int(3), 1, 20);
    p.availability = clamp(1 - p.attrs.hidden.lifePressure / 40, 0.5, 1);

    // retirement / drop-out: age, decline, life pressure, low ambition
    const pRetire = age >= 36 ? 0.5 : age >= 32 ? 0.12 + (age - 32) * 0.08 : age >= 25 && p.attrs.hidden.lifePressure >= 15 ? 0.08 : age >= 18 && age <= 19 && p.attrs.hidden.lifePressure >= 16 ? 0.06 : 0.01;
    if (rng.chance(pRetire + (cur < 6 && age > 22 ? 0.2 : 0))) { p.retired = true; p.club = null; rep.retired++; continue; }

    // youth graduation at 18 (or 17 if good enough)
    if (p.youth && (age >= 18 || (age === 17 && cur >= 10))) { p.youth = false; rep.graduated++; }
    p.minutes = 0; p.goals = 0; p.injuredDays = 0;
  }
  // youth intake: 3–5 per club, level scaled by facilities and club level
  for (const c of Object.values(w.clubs)) {
    const n = 3 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const roles = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD'] as const;
      const p = makePerson(w.nextPersonId++, rng, w.profile, roles[rng.int(roles.length)] ?? 'MID', c.level - 4 + (c.facilities - 3) * 0.6, w.year + 1, true);
      p.club = c.id; w.persons[p.id] = p; rep.intake++;
    }
  }
  return rep;
}

/** Club level = mean overall of its best 14 first-squad players (drives AI attributes and reputation). */
export function recomputeClubLevels(w: World): void {
  for (const c of Object.values(w.clubs)) {
    const ps = Object.values(w.persons).filter((p) => p.club === c.id && !p.youth && !p.retired).map(overall).sort((a, b) => b - a).slice(0, 14);
    if (ps.length) c.level = ps.reduce((s, v) => s + v, 0) / ps.length;
  }
}
