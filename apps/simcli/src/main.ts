/**
 * bullyoff-sim — batch simulation CLI.
 *
 *   bullyoff-sim sandbox [--seed N] [--ticks N] [--profile mens|womens] [--surface dry|watered|wet] [--json out.json]
 *   bullyoff-sim match   [--seed N] [--profile ...] [--surface ...] [--matches N] [--json out.json]
 *
 * `sandbox` runs the Phase 1 physics fixture (golden hash). `match` plays full
 * matches under the laws with the naive controller (Phase 2) — Phase 3 swaps in
 * the AI, Phase 4 adds aggregate statistics and the calibration comparison.
 */
import { writeFileSync } from 'node:fs';
import { hashLog, simulate, simulateMatch, type MatchEvent, type ProfileId, type SurfaceState } from '@bullyoff/engine';
import { fullSquads, matchSetup, sandboxScript, sandboxSetup } from '@bullyoff/engine/fixtures';
import { naiveController } from '@bullyoff/engine/naive';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';

const args = process.argv.slice(2);
const mode = args[0] === 'match' ? 'match' : 'sandbox';
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? String(args[i + 1]) : def;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log('bullyoff-sim sandbox|match [--seed N] [--ticks N] [--matches N] [--profile mens|womens] [--surface dry|watered|wet] [--json out.json]');
  process.exit(0);
}

const seed = Number(opt('seed', '42'));
const profile = opt('profile', 'mens') as ProfileId;
const surface = opt('surface', 'watered') as SurfaceState;
const jsonOut = opt('json', '');

function summarise(events: readonly MatchEvent[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.t, (counts.get(e.t) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort());
}

if (mode === 'sandbox') {
  const ticks = Number(opt('ticks', '600'));
  const t0 = performance.now();
  const log = simulate(sandboxSetup(profile, surface), seed, sandboxScript(seed, ticks), ticks);
  const t1 = performance.now();
  console.log(`bullyoff-sim sandbox · ${profile}/${surface} · seed ${seed} · ${ticks} ticks (${(ticks / 20).toFixed(0)} s of play)`);
  console.log(`hash ${hashLog(log)} · ${(t1 - t0).toFixed(1)} ms · ${log.events.length} events · ${log.frames.length} frames`);
  for (const [k, v] of Object.entries(summarise(log.events))) console.log(`  ${k.padEnd(22)} ${v}`);
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(log)); console.log(`wrote ${jsonOut}`); }
} else {
  const n = Number(opt('matches', '1'));
  const t0 = performance.now();
  const totals = new Map<string, number>();
  const scores: string[] = [];
  let lastLog = null as ReturnType<typeof simulateMatch> | null;
  for (let i = 0; i < n; i++) {
    const s = seed + i;
    const log = simulateMatch(matchSetup(profile, surface, FIH_OUTDOOR_FAST), s, naiveController(s, fullSquads()));
    lastLog = log;
    for (const [k, v] of Object.entries(summarise(log.events))) totals.set(k, (totals.get(k) ?? 0) + v);
    const ft = log.events.find((e) => e.t === 'FullTime');
    scores.push(ft?.t === 'FullTime' ? `${ft.score[0]}-${ft.score[1]}` : '?');
  }
  const t1 = performance.now();
  console.log(`bullyoff-sim match · ${profile}/${surface} · ${n} match(es) from seed ${seed} · ${((t1 - t0) / n).toFixed(0)} ms/match`);
  console.log(`scores: ${scores.join(' ')}`);
  for (const [k, v] of [...totals.entries()].sort()) console.log(`  ${k.padEnd(22)} ${(v / n).toFixed(2)} /match`);
  if (jsonOut && lastLog) { writeFileSync(jsonOut, JSON.stringify(lastLog)); console.log(`wrote ${jsonOut} (last match)`); }
}
