/**
 * Save format + linear migrations (ADR-007). A save is JSON with a header; the
 * chain migrate_vN_to_vN+1 brings older saves forward; a newer save is refused.
 * IndexedDB storage lives in the app; this module is pure and testable in Node.
 */
import type { World } from './model.js';

export const SAVE_VERSION = 1;

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
