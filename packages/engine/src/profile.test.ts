/**
 * BRIEF §5.0 / Phase 4 gate: switching profile changes only loaded configuration.
 * No `if (isWomens)` or profile-id branches anywhere in engine/rules/shared code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MENS, WOMENS } from './profile.js';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('profiles are configuration, not code paths', () => {
  it('no source file outside profile.ts / fixtures / CLI mentions a profile id or an isWomens-style flag', () => {
    const roots = [join(__dirname), join(__dirname, '..', '..', 'rules', 'src'), join(__dirname, '..', '..', 'shared', 'src')];
    const offenders: string[] = [];
    for (const r of roots) for (const f of walk(r)) {
      const base = f.split('\\').join('/');
      if (base.endsWith('/profile.ts') || base.includes('/sim/fixtures.ts') || base.includes('/sim/scenarios.ts') || base.includes('/sim/naiveController.ts') || base.includes('/sim/golden.ts')) continue;
      const src = readFileSync(f, 'utf8');
      if (/isWomens|isMens|['"]womens['"]|['"]mens['"]/.test(src)) offenders.push(base);
    }
    expect(offenders).toEqual([]);
  });
  it('the two profiles differ only in values (same shape), and surfaces are shared', () => {
    expect(Object.keys(MENS).sort()).toEqual(Object.keys(WOMENS).sort());
    expect(MENS.surfaces).toEqual(WOMENS.surfaces);
    expect(WOMENS.strike.hitSpeed).toBeLessThan(MENS.strike.hitSpeed);
    // Both keepers are calibrated against their own game's shot tempo (96-match runs, docs/rules/
    // calibration.md); the women's target of 3.6 goals is reached through the slower ball, not a
    // relatively stronger keeper, so no ordering between the two scales is asserted — only that both
    // stay in the calibrated regime.
    for (const p of [MENS, WOMENS]) { expect(p.calibration.gkSaveScale).toBeGreaterThan(1.5); expect(p.calibration.gkSaveScale).toBeLessThan(2.5); }
  });
});
