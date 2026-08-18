/**
 * bullyoff-sim — batch simulation CLI.
 *
 * Phase 0: prints identity and exits. Phase 4 adds:
 *   bullyoff-sim run --profile mens --matches 10000 --seed 42 --out out.json
 *   bullyoff-sim stats out.json
 * and the comparison against docs/rules/calibration-data.md.
 */
import { PACKAGE_NAME as ENGINE, TICK_HZ } from '@bullyoff/engine';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('bullyoff-sim — batch simulation CLI (Phase 0 placeholder)');
  process.exit(0);
}
console.log(`bullyoff-sim · engine=${ENGINE} · tick=${TICK_HZ} Hz · nothing to simulate yet (Phase 0)`);
