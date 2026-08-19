/**
 * Batch worker: simulates a range of seeds with the AI and returns per-match stats.
 * Spawned as a child process under the same tsx loader as the CLI (Node 22 does
 * not apply --import loaders to worker_threads); the job comes in as argv JSON,
 * the stats go out as one JSON line on stdout. One match's log never leaves the
 * worker — only its MatchStats — so 10 000 matches stay cheap.
 */
import { aiController, attributesFor, getProfile, matchStats, simulateMatch, squadsFromSetup, type MatchStats, type ProfileId, type SurfaceState } from '@bullyoff/engine';
import { Rng } from '@bullyoff/shared';
import { aiMatchSetup } from '@bullyoff/engine/fixtures';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';

export interface BatchJob {
  seeds: number[];
  profile: ProfileId;
  surface: SurfaceState;
  level: number;
  /** Optional level for the away side (quality-spread experiments). */
  awayLevel?: number;
  /** Per-match random level offset ±spread for each team (seeded) — a league is not 12 identical sides. */
  spread?: number;
}

export function runJob(job: BatchJob): MatchStats[] {
  const out: MatchStats[] = [];
  for (const seed of job.seeds) {
    const setup = aiMatchSetup(job.profile, job.surface, FIH_OUTDOOR_FAST, job.level);
    let home = job.level, away = job.awayLevel ?? job.level;
    if (job.spread) {
      const r = new Rng(seed, 77);
      home = Math.round(job.level + r.range(-job.spread, job.spread));
      away = Math.round((job.awayLevel ?? job.level) + r.range(-job.spread, job.spread));
    }
    if (home !== job.level || away !== job.level) {
      setup.players = setup.players.map((p) => (p.role ? { ...p, attributes: attributesFor(p.role, p.team === 0 ? home : away) } : p));
    }
    const log = simulateMatch(setup, seed, aiController(seed, squadsFromSetup(setup.players), { profile: getProfile(job.profile), surface: job.surface }));
    out.push(matchStats(log));
  }
  return out;
}

const jobArg = process.argv.find((a) => a.startsWith('--job='));
if (jobArg) {
  const job = JSON.parse(jobArg.slice(6)) as BatchJob;
  process.stdout.write(JSON.stringify(runJob(job)) + '\n');
}
