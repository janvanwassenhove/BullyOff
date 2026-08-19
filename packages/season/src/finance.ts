/**
 * Club finances at an honest amateur scale (BRIEF Phase 6): membership fees,
 * a sponsor or two, facility and travel costs, a paid head coach in tier 1.
 * Euros per season; deterministic. Nothing here buys players — hockey clubs
 * don't have a transfer market — but a healthy balance improves facilities and
 * a broke club loses coaching hours.
 */
import { Rng, clamp } from '@bullyoff/shared';
import type { World } from './model.js';

export function seasonFinances(w: World): void {
  const rng = new Rng(w.seed, 9800 + w.year);
  for (const c of Object.values(w.clubs)) {
    const members = Math.round(250 + c.reputation * 6 + rng.gaussian(0, 40));
    c.finances.membershipIncome = members * 250; // ≈ a Belgian club fee incl. youth
    c.finances.sponsorIncome = Math.round((c.tier === 1 ? 45000 : 15000) * (0.7 + c.reputation / 100) + rng.gaussian(0, 5000));
    const income = c.finances.membershipIncome + c.finances.sponsorIncome;
    // upkeep grows steeply with facilities (water pitch, lights, clubhouse); "other" = kit, insurance, federation fees, events
    c.finances.facilityCosts = 12000 + c.facilities * c.facilities * 3800 + 8000 + c.facilities * 2000;
    c.finances.travelCosts = 6000 + rng.int(3000);
    c.finances.coachingCosts = (c.tier === 1 ? 32000 : 14000) + Math.round(income * (0.25 + rng.range(0, 0.15)));
    const net = income - c.finances.facilityCosts - c.finances.travelCosts - c.finances.coachingCosts;
    c.finances.balance += net;
    // invest / cut back — a volunteer board spends what it has; nobody gets rich
    if (c.finances.balance > 100000 && c.facilities < 5 && rng.chance(0.35)) { c.facilities++; c.finances.balance -= 60000; }
    if (c.finances.balance < -30000 && c.facilities > 1) { c.facilities--; c.finances.balance += 15000; }
    c.finances.balance = clamp(c.finances.balance, -150000, 600_000);
  }
}
