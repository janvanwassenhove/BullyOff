/** CLI: pnpm calibrate <aggregate.json> [--profile mens|womens] */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Aggregate } from '@bullyoff/engine';
import { compare, formatReport } from './index.js';
import type { ProfileId } from './targets.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: calibrate <aggregate.json> [--profile mens|womens]'); process.exit(2); }
const raw = JSON.parse(readFileSync(resolve(process.env['INIT_CWD'] ?? process.cwd(), file), 'utf8')) as { aggregate: Aggregate };
const agg = raw.aggregate;
const pi = args.indexOf('--profile');
const profile = (pi >= 0 ? args[pi + 1] : agg.profile) as ProfileId;
const report = compare(agg, profile);
console.log(formatReport(report));
process.exit(report.allMeasuredPass ? 0 : 1);
