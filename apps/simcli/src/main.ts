/**
 * bullyoff-sim — batch simulation CLI.
 *
 *   bullyoff-sim sandbox  [--seed N] [--ticks N] [--profile mens|womens] [--surface dry|watered|wet] [--json out.json]
 *   bullyoff-sim match    [--seed N] [--profile ...] [--surface ...] [--matches N] [--controller ai|naive] [--json out.json]
 *   bullyoff-sim scenario <id|list> [--json out.json]
 *   bullyoff-sim batch    [--seed N] [--matches N] [--profile ...] [--surface ...] [--level L] [--away-level L] [--workers K] --out agg.json
 *
 * `sandbox` runs the Phase 1 physics fixture (golden hash). `match` plays full
 * matches under the laws with the utility AI (Phase 3; `--controller naive` for
 * the Phase 2 placeholder). `scenario` runs a §6.2 fixture and prints its event
 * log in text form for review. Phase 4 adds aggregate statistics + calibration.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { aggregate, type MatchStats } from '@bullyoff/engine';
import { runJob, type BatchJob } from './batchWorker.js';
import { aiController, getProfile, hashLog, simulate, simulateMatch, squadsFromSetup, type MatchEvent, type ProfileId, type SurfaceState } from '@bullyoff/engine';
import { aiMatchSetup, fullSquads, matchSetup, sandboxScript, sandboxSetup } from '@bullyoff/engine/fixtures';
import { naiveController } from '@bullyoff/engine/naive';
import { SCENARIOS, runScenario, scenarioById } from '@bullyoff/engine/scenarios';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';

const args = process.argv.slice(2);
const mode = args[0] === 'match' ? 'match' : args[0] === 'scenario' ? 'scenario' : args[0] === 'batch' ? 'batch' : 'sandbox';
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? String(args[i + 1]) : def;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log('bullyoff-sim sandbox|match|scenario <id|list> [--seed N] [--ticks N] [--matches N] [--controller ai|naive] [--profile mens|womens] [--surface dry|watered|wet] [--json out.json]');
  process.exit(0);
}

const seed = Number(opt('seed', '42'));
const profile = opt('profile', 'mens') as ProfileId;
const surface = opt('surface', 'watered') as SurfaceState;
// output paths resolve against the directory the user ran pnpm from, not the package dir
const outDir = process.env['INIT_CWD'] ?? process.cwd();
const jsonOut = opt('json', '') ? resolve(outDir, opt('json', '')) : '';

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
} else if (mode === 'batch') {
  const n = Number(opt('matches', '50'));
  const level = Number(opt('level', '12'));
  const awayLevelStr = opt('away-level', '');
  const spread = Number(opt('spread', '0'));
  const workers = Math.max(1, Math.min(Number(opt('workers', String(Math.max(1, cpus().length - 1)))), n));
  const out = opt('out', '') ? resolve(outDir, opt('out', '')) : '';
  const seeds = Array.from({ length: n }, (_, i) => seed + i);
  const jobs: BatchJob[] = Array.from({ length: workers }, (_, w) => ({
    seeds: seeds.filter((_, i) => i % workers === w), profile, surface, level,
    ...(awayLevelStr ? { awayLevel: Number(awayLevelStr) } : {}),
    ...(spread > 0 ? { spread } : {}),
  }));
  const t0 = performance.now();
  const results = await Promise.all(jobs.map((job) => runInWorker(job)));
  const all = results.flat().sort((a, b) => a.seed - b.seed);
  const agg = aggregate(all);
  const t1 = performance.now();
  console.log(`bullyoff-sim batch · ${profile}/${surface} · level ${level}${awayLevelStr ? ' vs ' + awayLevelStr : ''} · ${n} matches · ${workers} workers · ${((t1 - t0) / 1000).toFixed(1)} s (${((t1 - t0) / n).toFixed(0)} ms/match wall)`);
  const { scorelines, teamGoalsHistogram, ...rest } = agg;
  for (const [k, v] of Object.entries(rest)) console.log(`  ${k.padEnd(24)} ${typeof v === 'number' ? v.toFixed(3) : v}`);
  console.log(`  team goals histogram    ${teamGoalsHistogram.join(' ')}`);
  const top = Object.entries(scorelines).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${String(v)}`).join(' ');
  console.log(`  top scorelines          ${top}`);
  if (out) { writeFileSync(out, JSON.stringify({ aggregate: agg, matches: all }, null, 1)); console.log(`wrote ${out}`); }
} else if (mode === 'scenario') {
  const id = args[1] ?? 'list';
  if (id === 'list') {
    for (const sc of SCENARIOS) console.log(`${sc.id.padEnd(26)} ${sc.title} — ${sc.mustLookRight}`);
  } else {
    const sc = scenarioById(id);
    if (!sc) { console.error(`unknown scenario ${id}`); process.exit(1); }
    const log = runScenario(sc);
    console.log(`scenario ${sc.id} · ${sc.title} · seed ${sc.seed} · ${sc.ticks} ticks · hash ${hashLog(log)}`);
    console.log(`must look right: ${sc.mustLookRight}`);
    for (const e of log.events) {
      if (e.t === 'BallBounce' || e.t === 'Line23Crossed' || e.t === 'BallStopped' || e.t === 'PlayersPlaced' || e.t === 'Clock') continue;
      const { t, tick, ...rest } = e;
      console.log(`  ${String(tick).padStart(5)} ${(tick / 20).toFixed(1).padStart(6)}s ${t.padEnd(20)} ${JSON.stringify(rest)}`);
    }
    if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(log)); console.log(`wrote ${jsonOut}`); }
  }
} else {
  const n = Number(opt('matches', '1'));
  const controllerKind = opt('controller', 'ai');
  const t0 = performance.now();
  const totals = new Map<string, number>();
  const scores: string[] = [];
  let lastLog = null as ReturnType<typeof simulateMatch> | null;
  for (let i = 0; i < n; i++) {
    const s = seed + i;
    const setup = controllerKind === 'naive' ? matchSetup(profile, surface, FIH_OUTDOOR_FAST) : aiMatchSetup(profile, surface, FIH_OUTDOOR_FAST);
    const controller = controllerKind === 'naive' ? naiveController(s, fullSquads()) : aiController(s, squadsFromSetup(setup.players), { profile: getProfile(profile), surface });
    const log = simulateMatch(setup, s, controller);
    lastLog = log;
    for (const [k, v] of Object.entries(summarise(log.events))) totals.set(k, (totals.get(k) ?? 0) + v);
    const ft = log.events.find((e) => e.t === 'FullTime');
    scores.push(ft?.t === 'FullTime' ? `${ft.score[0]}-${ft.score[1]}` : '?');
  }
  const t1 = performance.now();
  console.log(`bullyoff-sim match · ${controllerKind} · ${profile}/${surface} · ${n} match(es) from seed ${seed} · ${((t1 - t0) / n).toFixed(0)} ms/match`);
  console.log(`scores: ${scores.join(' ')}`);
  for (const [k, v] of [...totals.entries()].sort()) console.log(`  ${k.padEnd(22)} ${(v / n).toFixed(2)} /match`);
  if (jsonOut && lastLog) { writeFileSync(jsonOut, JSON.stringify(lastLog)); console.log(`wrote ${jsonOut} (last match)`); }
}

/** Run a job in a child process under the same tsx loader; falls back to in-process if spawning fails. */
async function runInWorker(job: BatchJob): Promise<MatchStats[]> {
  if (job.seeds.length === 0) return [];
  try {
    return await new Promise<MatchStats[]>((resolve, reject) => {
      const script = fileURLToPath(new URL('./batchWorker.ts', import.meta.url));
      const child = spawn(process.execPath, [...process.execArgv, script, `--job=${JSON.stringify(job)}`], { stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = '';
      child.stdout.on('data', (d: Buffer) => { buf += d.toString(); });
      child.once('error', reject);
      child.once('close', (code) => {
        if (code !== 0) { reject(new Error(`worker exited ${code}`)); return; }
        try { resolve(JSON.parse(buf.trim().split('\n').pop() ?? '[]') as MatchStats[]); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
      });
    });
  } catch (err) {
    console.warn('worker unavailable, running in-process:', err instanceof Error ? err.message : String(err));
    return runJob(job);
  }
}
