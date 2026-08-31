/**
 * The nine national sides of the nations competition (Phase 12, Pro League format). A nation is not
 * a club: it has no fixtures through the engine, no finances, no squad file — only a strength that
 * follows the best fourteen players of that nationality anywhere in the world, and national colours.
 */
import { clamp } from '@bullyoff/shared';
import type { Nation, NationId, Person } from './model.js';

/** Recognisable national kit colours (countries are geography, not clubs — ADR-006 allows them). */
export const NATION_COLOURS: Record<NationId, [number, number]> = {
  BEL: [0xd00000, 0x000000], NED: [0xf47c20, 0xffffff], GER: [0x111111, 0xffffff], GBR: [0x1d3557, 0xd00000],
  FRA: [0x2444a0, 0xffffff], ESP: [0xc1121f, 0xffd60a], ARG: [0x75aadb, 0xffffff], AUS: [0x0b6623, 0xffd60a], IND: [0x3a86ff, 0xf47c20],
};

/** Baseline strengths for nations whose league we do not simulate (world-elite sides sit above club level). */
export const NATION_BASE: Record<NationId, number> = { BEL: 15.5, NED: 15.8, GER: 15.2, GBR: 14.8, FRA: 13.8, ESP: 14.6, ARG: 15.0, AUS: 15.4, IND: 14.9 };

/**
 * A league country's strength follows its best fourteen nationals in the world (a national team
 * plays a class above club hockey, hence the +1.8); a nation without fourteen keeps its baseline.
 */
export function buildNations(persons: Record<number, Person>, year: number): Nation[] {
  void year;
  const ids = Object.keys(NATION_BASE) as NationId[];
  return ids.map((id) => {
    const pool = Object.values(persons)
      .filter((p) => p.nationality === id && !p.retired && !p.youth)
      .map((p) => {
        const t = p.attrs.technical, m = p.attrs.mental, ph = p.attrs.physical;
        return (t.firstTouch + t.push + t.hit + t.elimination + m.decisions + m.composure + ph.pace + ph.stamina) / 8;
      })
      .sort((a, b) => b - a).slice(0, 14);
    const level = pool.length >= 14 ? clamp(pool.reduce((s, v) => s + v, 0) / pool.length + 1.8, 10, 19) : NATION_BASE[id];
    return { id, level, colours: NATION_COLOURS[id] };
  });
}
