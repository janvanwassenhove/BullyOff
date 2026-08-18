/**
 * bullyoff-sim — batch simulation CLI.
 *
 * Phase 1: runs the sandbox fixture, prints the log hash and an event summary.
 *   bullyoff-sim [--seed N] [--ticks N] [--profile mens|womens] [--surface dry|watered|wet] [--json out.json]
 * Phase 4 adds real batch runs, aggregate statistics and the calibration comparison.
 */
import { writeFileSync } from 'node:fs';
import { hashLog, simulate, type ProfileId, type SurfaceState } from '@bullyoff/engine';
import { sandboxScript, sandboxSetup } from '@bullyoff/engine/fixtures';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? String(args[i + 1]) : def;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log('bullyoff-sim [--seed N] [--ticks N] [--profile mens|womens] [--surface dry|watered|wet] [--json out.json]');
  process.exit(0);
}

const seed = Number(opt('seed', '42'));
const ticks = Number(opt('ticks', '600'));
const profile = opt('profile', 'mens') as ProfileId;
const surface = opt('surface', 'watered') as SurfaceState;
const jsonOut = opt('json', '');

const t0 = performance.now();
const log = simulate(sandboxSetup(profile, surface), seed, sandboxScript(seed, ticks), ticks);
const t1 = performance.now();
const hash = hashLog(log);

const counts = new Map<string, number>();
for (const e of log.events) counts.set(e.t, (counts.get(e.t) ?? 0) + 1);

console.log(`bullyoff-sim · ${profile}/${surface} · seed ${seed} · ${ticks} ticks (${(ticks / 20).toFixed(0)} s of play)`);
console.log(`hash ${hash} · ${(t1 - t0).toFixed(1)} ms · ${log.events.length} events · ${log.frames.length} frames`);
for (const [k, v] of [...counts.entries()].sort()) console.log(`  ${k.padEnd(18)} ${v}`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(log));
  console.log(`wrote ${jsonOut}`);
}
