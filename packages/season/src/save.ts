/**
 * Save format + linear migrations (ADR-007). A save is JSON with a header; the
 * chain migrate_vN_to_vN+1 brings older saves forward; a newer save is refused.
 * IndexedDB storage lives in the app; this module is pure and testable in Node.
 */
import type { World } from './model.js';

export const SAVE_VERSION = 3;

export interface SaveFile {
  format: 'bullyoff-save';
  version: number;
  engineVersion: string;
  profile: string;
  createdAt: string; // app-side ISO string; never inside the engine
  world: World;
}

export function serialize(world: World, engineVersion: string, createdAt: string): SaveFile {
  return { format: 'bullyoff-save', version: SAVE_VERSION, engineVersion, profile: world.profile, createdAt, world };
}

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] converts version n → n+1. */
export const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1: pre-release saves had no `history`
  0: (d) => ({ ...d, version: 1, world: { history: [], ...(d['world'] as Record<string, unknown>) } }),
  // 1 → 2 (Phase 8): club identity fields and world.flavour
  1: (d) => {
    const world: Record<string, unknown> = { flavour: 'mixed', ...(d['world'] as Record<string, unknown>) };
    const clubs = world['clubs'] as Record<string, Record<string, unknown>>;
    for (const c of Object.values(clubs)) {
      c['town'] ??= (typeof c['name'] === 'string' ? c['name'].split(' ')[0] : undefined) ?? 'Town';
      c['lang'] ??= 'nl'; c['nickname'] ??= null; c['badge'] ??= { shape: 'shield', motif: 'stick', split: 'plain' }; c['founded'] ??= 1950;
      c['honours'] ??= { titles: [], promotions: [] };
    }
    return { ...d, version: 2, world };
  },
  // 2 → 3 (Phase 9.1): named tactics (formation / press / mentality) on every club
  2: (d) => {
    const world = d['world'] as Record<string, unknown>;
    const clubs = world['clubs'] as Record<string, Record<string, unknown>>;
    for (const c of Object.values(clubs)) {
      const tac = (c['tactics'] ?? {}) as Record<string, unknown>;
      const ph = typeof tac['pressHeight'] === 'number' ? tac['pressHeight'] : 0.55;
      const dl = typeof tac['defensiveLine'] === 'number' ? tac['defensiveLine'] : 0.45;
      tac['formation'] ??= '4-3-3';
      tac['press'] ??= ph > 0.75 ? 'full' : ph < 0.35 ? 'zone' : 'half';
      tac['mentality'] ??= dl > 0.55 ? 'attacking' : dl < 0.35 ? 'defensive' : 'balanced';
      c['tactics'] = tac;
    }
    return { ...d, version: 3, world };
  },
};

export function deserialize(json: string | SaveFile): World {
  let doc = (typeof json === 'string' ? JSON.parse(json) : json) as Record<string, unknown>;
  if (doc['format'] !== 'bullyoff-save') throw new Error('not a BULLY OFF save');
  let v = Number(doc['version'] ?? 0);
  if (v > SAVE_VERSION) throw new Error(`save version ${v} is newer than this app (${SAVE_VERSION})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`no migration from save version ${v}`);
    doc = m(doc);
    v = Number(doc['version']);
  }
  return doc['world'] as World;
}
