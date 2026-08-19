/**
 * Calibration harness (BRIEF §6, ADR-010 layer 3). Compares a simcli batch
 * aggregate against the targets, per profile, with tolerance bands and a
 * chi-square shape test of the per-team goal distribution against a Poisson
 * with the target mean (placeholder shape until a real scoreline table exists).
 *
 *   pnpm calibrate <aggregate.json> [--profile mens|womens]
 */
import type { Aggregate } from '@bullyoff/engine';
import { TARGETS, type ProfileId, type Target } from './targets.js';

export const PACKAGE_NAME = '@bullyoff/calibrate' as const;
export { TARGETS, PRO_LEAGUE_GOALS } from './targets.js';

export interface MetricResult {
  key: string; label: string; target: number; lo: number; hi: number; actual: number; pass: boolean; status: Target['status'];
}
export interface ShapeResult { chi2: number; df: number; pValue: number; pass: boolean; observed: number[]; expected: number[] }
export interface Report { profile: ProfileId; matches: number; metrics: MetricResult[]; shape: ShapeResult; passed: number; failed: number; allMeasuredPass: boolean }

export function compare(agg: Aggregate, profile: ProfileId): Report {
  const metrics: MetricResult[] = TARGETS[profile].map((t) => {
    const actual = agg[t.key];
    const a = typeof actual === 'number' ? actual : NaN;
    return { key: t.key, label: t.label, target: t.target, lo: t.lo, hi: t.hi, actual: a, pass: a >= t.lo && a <= t.hi, status: t.status };
  });
  const goalTarget = TARGETS[profile].find((t) => t.key === 'goalsPerMatch')?.target ?? 5;
  const shape = poissonShape(agg.teamGoalsHistogram, goalTarget / 2, agg.matches * 2);
  const passed = metrics.filter((m) => m.pass).length + (shape.pass ? 1 : 0);
  const failed = metrics.length + 1 - passed;
  return { profile, matches: agg.matches, metrics, shape, passed, failed, allMeasuredPass: metrics.filter((m) => m.status === 'measured').every((m) => m.pass) };
}

/** Chi-square of observed per-team goal counts (0..6+) vs Poisson(mean). */
export function poissonShape(observed: number[], mean: number, n: number): ShapeResult {
  const k = observed.length; // 7 bins: 0..5, 6+
  const probs: number[] = [];
  let acc = 0;
  for (let i = 0; i < k - 1; i++) { const p = poissonPmf(i, mean); probs.push(p); acc += p; }
  probs.push(Math.max(1e-9, 1 - acc));
  const expected = probs.map((p) => p * n);
  let chi2 = 0;
  for (let i = 0; i < k; i++) { const e = expected[i] ?? 1e-9; const o = observed[i] ?? 0; if (e > 0) chi2 += ((o - e) * (o - e)) / e; }
  const df = k - 1;
  const p = chiSquareSurvival(chi2, df);
  return { chi2, df, pValue: p, pass: p > 0.01, observed, expected: expected.map((e) => Math.round(e * 10) / 10) };
}

function poissonPmf(i: number, m: number): number {
  let f = 1; for (let j = 2; j <= i; j++) f *= j;
  return (Math.exp(-m) * Math.pow(m, i)) / f;
}

/** Upper-tail chi-square via the regularised gamma function (series/continued fraction). */
export function chiSquareSurvival(x: number, k: number): number {
  return 1 - regularisedGammaP(k / 2, x / 2);
}
function regularisedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 200; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-12) break; }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // continued fraction for Q, then P = 1 - Q
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}
function logGamma(z: number): number {
  const g = 7, coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = coef[0] ?? 1;
  for (let i = 1; i < g + 2; i++) x += (coef[i] ?? 0) / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function formatReport(r: Report): string {
  const lines: string[] = [];
  lines.push(`calibration · ${r.profile} · ${r.matches} matches · ${r.passed} pass / ${r.failed} fail · measured-all-pass: ${r.allMeasuredPass ? 'yes' : 'NO'}`);
  lines.push('  metric'.padEnd(52) + 'target'.padStart(8) + 'band'.padStart(16) + 'actual'.padStart(9) + '  result');
  for (const m of r.metrics) {
    lines.push(`  ${m.label.padEnd(50)}${m.target.toFixed(2).padStart(8)}${`[${m.lo.toFixed(2)}, ${m.hi.toFixed(2)}]`.padStart(16)}${m.actual.toFixed(2).padStart(9)}  ${m.pass ? 'ok ' : 'MISS'} ${m.status === 'EST' ? '(est)' : ''}`);
  }
  lines.push(`  team-goals shape vs Poisson: chi²=${r.shape.chi2.toFixed(1)} df=${r.shape.df} p=${r.shape.pValue.toFixed(3)} ${r.shape.pass ? 'ok' : 'MISS'}  observed ${r.shape.observed.join('/')}  expected ${r.shape.expected.join('/')}`);
  return lines.join('\n');
}
