/**
 * Calibration targets — the machine-readable twin of docs/rules/calibration-data.md.
 * Keep the two in sync. `measured` rows carry ±10 % bands (BRIEF §6.1); `EST` rows
 * carry the wider bands stated in the document.
 */
import type { Aggregate } from '@bullyoff/engine';

export type ProfileId = 'mens' | 'womens';

export interface Target {
  key: keyof Aggregate;
  label: string;
  target: number;
  lo: number;
  hi: number;
  status: 'measured' | 'EST';
  source: string;
}

const pct = (t: number, p: number): [number, number] => [t * (1 - p), t * (1 + p)];
const band = (key: keyof Aggregate, label: string, target: number, [lo, hi]: [number, number], status: Target['status'], source: string): Target =>
  ({ key, label, target, lo, hi, status, source });

export const TARGETS: Record<ProfileId, Target[]> = {
  mens: [
    band('goalsPerMatch', 'Goals per match', 5.4, pct(5.4, 0.10), 'measured', 'Belgian HL M 2024–25: 753/139; 5-season 4.9–6.0'),
    band('drawRate', 'Draw rate', 0.11, [0.06, 0.18], 'measured', 'Belgian HL M 2024–25 standings (derived)'),
    band('pcGoalShare', 'Share of goals from PC (+PS)', 0.33, [0.25, 0.40], 'measured', 'FIH "one-third"; top-scorer FG/PC/PS'),
    band('pcPerMatch', 'Penalty corners per match', 9, [6, 12], 'EST', 'Hockey One R1 2022 ≈ 10.5; elite 4–6/side'),
    band('pcConversion', 'PC conversion', 0.20, [0.14, 0.28], 'EST', 'derived: ⅓ × goals / PCs'),
    band('circleEntriesPerMatch', 'Circle entries per match', 36, [26, 48], 'EST', 'Hockey One R1 2022 ≈ 33'),
    band('shotsPerMatch', 'Shots per match', 24, [16, 34], 'EST', '≈0.65 per circle entry'),
    band('shotsOnTargetShare', 'Shots on target share', 0.45, [0.30, 0.60], 'EST', 'general elite reporting'),
    band('psPerMatch', 'Penalty strokes per match', 0.25, [0.1, 0.5], 'EST', 'top-scorer PS counts'),
    band('psConversion', 'Stroke conversion', 0.75, [0.6, 0.9], 'EST', 'Olympics.com 70–80 %'),
    band('greenPerMatch', 'Green cards per match', 3, [1.5, 5], 'EST', 'typical'),
    band('yellowPerMatch', 'Yellow cards per match', 0.7, [0.2, 1.5], 'EST', 'typical'),
    band('redPerMatch', 'Red cards per match', 0.02, [0, 0.1], 'EST', 'rare'),
    band('restartsPerMatch', 'Restarts (free hits, side-ins, hit-outs, corners) per match', 110, [70, 160], 'EST', 'typical stoppage counts'),
  ],
  womens: [
    band('goalsPerMatch', 'Goals per match', 3.6, pct(3.6, 0.10), 'measured', 'Belgian HL W 2024–25: 430/120'),
    band('drawRate', 'Draw rate', 0.25, [0.15, 0.35], 'measured', 'Belgian HL W 2024–25 standings (derived)'),
    band('pcGoalShare', 'Share of goals from PC (+PS)', 0.30, [0.22, 0.40], 'measured', 'top-scorer FG/PC/PS W 2024–25 (41 PC / 148)'),
    band('pcPerMatch', 'Penalty corners per match', 8, [5, 11], 'EST', 'as men, slightly fewer'),
    band('pcConversion', 'PC conversion', 0.17, [0.11, 0.25], 'EST', 'derived'),
    band('circleEntriesPerMatch', 'Circle entries per match', 34, [24, 46], 'EST', 'as men'),
    band('shotsPerMatch', 'Shots per match', 22, [14, 32], 'EST', 'as men'),
    band('shotsOnTargetShare', 'Shots on target share', 0.45, [0.30, 0.60], 'EST', 'as men'),
    band('psPerMatch', 'Penalty strokes per match', 0.2, [0.05, 0.5], 'EST', 'as men'),
    band('psConversion', 'Stroke conversion', 0.72, [0.55, 0.9], 'EST', 'as men'),
    band('greenPerMatch', 'Green cards per match', 2.5, [1, 5], 'EST', 'typical'),
    band('yellowPerMatch', 'Yellow cards per match', 0.5, [0.1, 1.3], 'EST', 'typical'),
    band('redPerMatch', 'Red cards per match', 0.02, [0, 0.1], 'EST', 'rare'),
    band('restartsPerMatch', 'Restarts per match', 105, [65, 155], 'EST', 'typical'),
  ],
};

/** Pro League reference (quality-shift check): evenly matched elite sides should move towards these. */
export const PRO_LEAGUE_GOALS: Record<ProfileId, number> = { mens: 4.76, womens: 4.22 };
