/**
 * League table with Belgian-style tie-breakers: points, wins, goal difference,
 * goals for, head-to-head points, then a deterministic seeded draw of lots
 * (never Math.random). Regular-phase fixtures only.
 */
import { Rng } from '@bullyoff/shared';
import type { ClubId, Fixture, TableRow, Tier, World } from './model.js';

export function standings(w: World, tier: Tier): TableRow[] {
  const rows = new Map<ClubId, TableRow>();
  for (const c of Object.values(w.clubs)) if (c.tier === tier) rows.set(c.id, { club: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  const played = w.season.fixtures.filter((f) => f.tier === tier && f.phase === 'regular' && f.played && f.result);
  for (const f of played) {
    const r = f.result; if (!r) continue;
    const h = rows.get(f.home), a = rows.get(f.away);
    if (!h || !a) continue;
    h.p++; a.p++; h.gf += r.home; h.ga += r.away; a.gf += r.away; a.ga += r.home;
    if (r.home > r.away) { h.w++; a.l++; h.pts += 3; } else if (r.home < r.away) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  const list = [...rows.values()];
  const h2h = (x: ClubId, y: ClubId): number => {
    let px = 0;
    for (const f of played) {
      const r = f.result; if (!r) continue;
      if ((f.home === x && f.away === y) || (f.home === y && f.away === x)) {
        const gx = f.home === x ? r.home : r.away, gy = f.home === x ? r.away : r.home;
        px += gx > gy ? 3 : gx === gy ? 1 : 0;
      }
    }
    return px;
  };
  const rng = new Rng(w.seed, 4000 + w.year + tier);
  const lots = new Map<ClubId, number>(); for (const c of list) lots.set(c.club, rng.next());
  list.sort((a, b) =>
    b.pts - a.pts || b.w - a.w || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || h2h(b.club, a.club) - h2h(a.club, b.club) || (lots.get(a.club) ?? 0) - (lots.get(b.club) ?? 0));
  return list;
}

/** Aggregate over a tie's legs (or a single match): [goals for club A, goals for club B]; A = the tie's "first named" club. */
export function tieAggregate(fixtures: readonly Fixture[], a: ClubId, b: ClubId): [number, number] {
  let ga = 0, gb = 0;
  for (const f of fixtures) {
    const r = f.result; if (!r) continue;
    if (f.home === a && f.away === b) { ga += r.home; gb += r.away; }
    else if (f.home === b && f.away === a) { ga += r.away; gb += r.home; }
  }
  return [ga, gb];
}
