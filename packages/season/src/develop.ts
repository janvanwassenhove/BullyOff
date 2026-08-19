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

export interface DevelopmentReport { grew: number; declined: number; retired: number; graduated: number; intake: number; moved: number; left: number }

/** First-squad size band clubs keep (amateur reality: 18–22 who turn up; beyond that people drift to another club or stop). */
export const SQUAD_MIN = 18, SQUAD_MAX = 22, YOUTH_MAX = 8;

/**
 * Squad regulator (Phase 8 — needed once 20 seasons of history are generated): surplus first-squad
 * players move to the thinnest squad in the world (a real amateur transfer: a lift, a friend, a lower tier),
 * or stop playing when nobody needs them; youth sections are capped. Deterministic.
 */
export function regulateSquads(w: World, rng: Rng, rep: DevelopmentReport): void {
  const clubs = Object.values(w.clubs);
  const squad = (id: string): Person[] => Object.values(w.persons).filter((p) => p.club === id && !p.retired && !p.youth);
  const youthOf = (id: string): Person[] => Object.values(w.persons).filter((p) => p.club === id && !p.retired && p.youth);
  for (const c of clubs) {
    const ys = youthOf(c.id).sort((a, b) => overall(a) - overall(b));
    while (ys.length > YOUTH_MAX) { const y = ys.shift(); if (y) { y.retired = true; y.club = null; rep.left++; } }
  }
  // iterate: move the weakest surplus player from the fullest club to the thinnest club while it helps
  for (let guard = 0; guard < 400; guard++) {
    const sizes = clubs.map((c) => ({ c, n: squad(c.id).length })).sort((a, b) => b.n - a.n);
    const full = sizes[0], thin = sizes[sizes.length - 1];
    if (!full || !thin || full.n <= SQUAD_MAX) break;
    // surplus: the lowest-rated non-GK (keep two keepers), with a little ambition-driven randomness
    const sq = squad(full.c.id);
    const gks = sq.filter((p) => p.role === 'GK').length;
    const cand = sq.filter((p) => p.role !== 'GK' || gks > 2).sort((a, b) => overall(a) - overall(b));
    const mover = cand[rng.int(Math.min(3, cand.length))] ?? cand[0];
    if (!mover) break;
    if (thin.n < SQUAD_MIN + 2 && thin.c.id !== full.c.id) { mover.club = thin.c.id; rep.moved++; }
    else { mover.retired = true; mover.club = null; rep.left++; }
  }
  // every first squad keeps a goalkeeper: graduate a youth keeper early, else retrain the weakest outfielder
  for (const c of clubs) {
    const sq = squad(c.id);
    if (sq.some((p) => p.role === 'GK')) continue;
    const y = youthOf(c.id).filter((p) => p.role === 'GK').sort((a, b) => overall(b) - overall(a))[0];
    if (y) { y.youth = false; rep.graduated++; continue; }
    const r = [...sq].sort((a, b) => overall(a) - overall(b))[0];
    if (r) { const lvl = Math.max(1, Math.round(overall(r) - 2)); r.role = 'GK'; const g = r.attrs.goalkeeper as unknown as Record<string, number>; for (const k of Object.keys(g)) g[k] = clamp(lvl + rng.int(3) - 1, 1, 20); }
  }
}

export function developSeason(w: World, facilitiesOf: (club: string | null) => number): DevelopmentReport {
  const rng = new Rng(w.seed, 9000 + w.year);
  const rep: DevelopmentReport = { grew: 0, declined: 0, retired: 0, graduated: 0, intake: 0, moved: 0, left: 0 };
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
    // growth stops at potential (a touch of overshoot): facilities and coaching get you there sooner, not further
    if (delta > 0) delta = Math.min(delta, Math.max(0, pot + 0.5 - cur));
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
  // youth intake: 2–4 per club, level scaled by facilities and club level
  for (const c of Object.values(w.clubs)) {
    const n = 2 + rng.int(3);
    const gks = Object.values(w.persons).filter((p) => p.club === c.id && !p.retired && p.role === 'GK').length;
    for (let i = 0; i < n; i++) {
      const roles = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD'] as const;
      const role = gks + i < 2 ? 'GK' : roles[rng.int(roles.length)] ?? 'MID'; // every club keeps two keepers coming through
      const p = makePerson(w.nextPersonId++, rng, w.profile, role, c.level - 3 + (c.facilities - 3) * 0.6, w.year + 1, true, w.flavour);
      p.club = c.id; w.persons[p.id] = p; rep.intake++;
    }
  }
  regulateSquads(w, rng, rep);
  return rep;
}

/** The top-flight standard attributes are rated against (the engine is calibrated at level 12 ± 2). */
export const TIER1_ANCHOR = 12.5;
/** The second tier's standard (≈ 2.5 below the top flight in the calibration picture). */
export const TIER2_ANCHOR = 10;

/**
 * Ratings are relative to the top flight of the day (as every 1–20 scale is): when the tier-1 mean drifts
 * from the anchor after a season of development, every rating (and potential) is nudged back by a
 * fraction of the drift. Keeps twenty generated seasons on the calibrated scale without freezing careers.
 */
export function normaliseLevels(w: World, rng: Rng, anchors: [number, number] = [TIER1_ANCHOR, TIER2_ANCHOR]): [number, number] {
  const out: [number, number] = [0, 0];
  for (const tier of [1, 2] as const) {
    const cs = Object.values(w.clubs).filter((c) => c.tier === tier);
    if (cs.length === 0) continue;
    const mean = cs.reduce((s, c) => s + c.level, 0) / cs.length;
    const delta = clamp(((anchors[tier - 1] ?? TIER1_ANCHOR) - mean) * 0.5, -0.6, 0.6);
    if (Math.abs(delta) < 0.05) continue;
    const ids = new Set(cs.map((c) => c.id));
    for (const p of Object.values(w.persons)) {
      if (p.retired || p.club === null || !ids.has(p.club)) continue;
      for (const g of GROUPS) shift(p, g, delta, rng);
      p.attrs.hidden.potential = clamp(Math.round(p.attrs.hidden.potential + delta), 1, 20);
    }
    out[tier - 1] = delta;
  }
  return out;
}

/** Club level = mean overall of its best 14 first-squad players (drives AI attributes and reputation). */
export function recomputeClubLevels(w: World): void {
  for (const c of Object.values(w.clubs)) {
    const ps = Object.values(w.persons).filter((p) => p.club === c.id && !p.youth && !p.retired).map(overall).sort((a, b) => b - a).slice(0, 14);
    if (ps.length) c.level = ps.reduce((s, v) => s + v, 0) / ps.length;
  }
}
