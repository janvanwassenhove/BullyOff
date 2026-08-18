import { fnv1a64, hashValue } from '@bullyoff/shared';
import type { MatchLog } from '../events/events.js';

/**
 * Deterministic hash of a whole log (header + events + frames). Frames are the
 * bulk; they are hashed as a flat numeric string (JSON number formatting is fully
 * specified) rather than through canonical-JSON key sorting, which is ~10× faster.
 */
export function hashLog(log: MatchLog): string {
  const head = hashValue(log.header);
  const evs = hashValue(log.events);
  let frameStr = '';
  for (const f of log.frames) frameStr += String(f.tick) + '|' + f.ball.join(',') + '|' + f.players.join(',') + ';';
  return fnv1a64(head + evs + fnv1a64(frameStr));
}
