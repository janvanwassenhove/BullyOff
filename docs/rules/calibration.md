# Calibration — targets vs achieved (Phase 4)

Run: `pnpm calibrate:run` (96 matches per profile, level 12 ± 2 quality spread, `FIH_OUTDOOR_FAST` laws, watered turf, 8 worker processes ≈ 45 s each). Targets and sources: [`calibration-data.md`](calibration-data.md) / `tools/calibrate/src/targets.ts`. Bands: ±10 % on measured rows, wider on `EST` rows. Engine **0.4.0**, 2026-08-19.

## Men's (`mens`) — measured rows all pass except PC share (near-miss)

| Metric | Target | Band | Achieved | Result |
|---|---|---|---|---|
| Goals per match | 5.40 | 4.86–5.94 | **5.41** | ok |
| Draw rate | 0.11 | 0.06–0.18 | **0.06** | ok (low edge) |
| Share of goals from PC (+PS) | 0.33 | 0.25–0.40 | **0.23** | **MISS** (near) |
| Penalty corners per match | 9 | 6–12 | 6.4 | ok (est, low edge) |
| PC conversion | 0.20 | 0.14–0.28 | 0.21 | ok (est) |
| Circle entries per match (attacking) | 36 | 26–48 | 21.8 | MISS (est) |
| Shots per match | 24 | 16–34 | 29 | ok (est) |
| Shots on target share | 0.45 | 0.30–0.60 | 0.34–0.38 | ok (est) |
| Penalty strokes per match | 0.25 | 0.10–0.50 | 0.05–0.15 | MISS/edge (est, n≈5–14) |
| Stroke conversion | 0.75 | 0.60–0.90 | 0.60 | ok (est, small n) |
| Green cards per match | 3 | 1.5–5 | 5.0 | ok (est, high edge) |
| Yellow cards per match | 0.7 | 0.2–1.5 | 0.73 | ok (est) |
| Red cards per match | 0.02 | 0–0.1 | 0.00 | ok (est) |
| Restarts per match | 110 | 70–160 | 68 | MISS (est) |
| Team-goals shape vs Poisson(2.7) | — | χ² p > 0.01 | p = 0.29 | ok |

## Women's (`womens`) — measured rows all pass

| Metric | Target | Band | Achieved | Result |
|---|---|---|---|---|
| Goals per match | 3.60 | 3.24–3.96 | **3.66** | ok |
| Draw rate | 0.25 | 0.15–0.35 | **0.17** | ok |
| Share of goals from PC (+PS) | 0.30 | 0.22–0.40 | **0.23** | ok (low edge) |
| Penalty corners per match | 8 | 5–11 | 6.5 | ok (est) |
| PC conversion | 0.17 | 0.11–0.25 | 0.16 | ok (est) |
| Circle entries per match (attacking) | 34 | 24–46 | 18.5 | MISS (est) |
| Shots per match | 22 | 14–32 | 32.5 | MISS (est, high edge) |
| Shots on target share | 0.45 | 0.30–0.60 | 0.42 | ok (est) |
| Penalty strokes per match | 0.2 | 0.05–0.5 | 0.07 | ok (est) |
| Stroke conversion | 0.72 | 0.55–0.90 | 0.58 | ok (est, small n) |
| Green cards per match | 2.5 | 1–5 | 5.1 | MISS (est, edge) |
| Yellow cards per match | 0.5 | 0.1–1.3 | 0.75 | ok (est) |
| Red cards per match | 0.02 | 0–0.1 | 0.00 | ok (est) |
| Restarts per match | 105 | 65–155 | 62 | MISS (est) |
| Team-goals shape vs Poisson(1.8) | — | χ² p > 0.01 | p = 0.008 | MISS (over-dispersed: excess 0-goal and 6+ team scores from the ±2 spread at a low mean) |

## The quality-shift (causality) check — Pro League reference

Two evenly matched elite sides (level 17 ± 0.5), 48 matches:

| | Belgian baseline (12 ± 2) | Elite even (17 ± 0.5) | Pro League 2024–25 |
|---|---|---|---|
| Men goals/match | 5.41 | **5.8** | 4.76 |
| Men draw rate | 0.06–0.17 | 0.17 | — |
| Men PCs/match | 6.4 | 5.5 | — |
| Women goals/match | 3.66 | **1.9** | 4.22 |

Verdict: **partially causal.** PCs and draws move the right way with quality; goals move the wrong way for men (up, not down) and too far for women (down to 1.9). Diagnosis: attacking quality (accuracy, strike speed) is modelled through attributes; *defensive organisation* is not (only keeper reflexes and tackle odds scale). Elite men's attackers therefore out-scale elite defences; elite women's keepers (with `gkSaveScale` 1.6 on top) over-scale. This is the honest state of the model and the first job for the next tuning pass — see "Known deviations".

## What was tuned (all as data — no engine branches; `profile.test.ts` enforces this)

- **Physics/profile:** effective player body radius 0.35 → **0.5 m** (legs and a lunging stick block the ball, not just the torso — needed for any body contact/PC frequency at all); rolling resistance and drag as in Phase 3; men's drag-flick speed 31 → 33 m/s.
- **Attribute mappings** (`attributes.ts`): keeper save chance `0.44 + 0.75·reflex − speed − reach` (reflex-dominated so quality bites; average keeper stops ≈ 55 % of shots on target incl. touches; goals ≈ 22 % of shots); a beaten keeper/miscontrolling player cannot re-attempt for 0.3–0.5 s (**trap cooldown** — this single change moved goals from 2 to 7 per match before the keeper was rebalanced); stroke save chance separate and low (≈ 0.3); strike error curve flattened (7.7°→2.9° across the 1–20 range) so elite attackers are accurate, not lasers.
- **Profile calibration knob** `calibration.gkSaveScale` — mens 1.0, **womens 1.6** — a PROVISIONAL multiplier carrying the part of the women's goal gap that shot speed alone does not explain. To be retired when defensive organisation is modelled.
- **Rules readings** (all PROVISIONAL, in `ruleset.md`): a raised shot at the *goalkeeper* is not dangerous play; feet is called on a lifted ball up to mid-thigh (0.8 m), above that the raised ball is the attacker's risk; a stroke needs a genuine goal-bound shot stopped by a body within 5 m of the line at > 8 m/s (else PC); a beaten keeper's touch does not end a stroke; cards on an already-suspended player extend the suspension.
- **AI:** attackers accept lane risk inside the D (a foot is a PC); three defenders block on the ball–goal line in their own D; tackle attempts rarer, with a beaten cooldown; PC first-runner charges.
- **Batch runner:** `--spread` gives each team a seeded per-match level offset (a league is not twelve identical sides) — this alone fixed the draw rate and the scoreline shape for the men.

## Known deviations (ranked by how much they matter to a coach)

1. **PC awards 6.4/match vs ≈ 9** (drives men's PC share 0.23 vs ≥ 0.25). Cause: defenders concede too few feet/stick fouls in the D; attackers rarely aim at feet; no third-party obstruction. Levers exist (`defend` blocking, tackle aggression, `laws.dangerHeight`), but the honest fix is AI behaviour: deliberate low shots at feet and defenders lunging in the D. Watch item for the review panel.
2. **Causality check** as above: defensive quality does not scale with attributes beyond keeper reflexes and tackle odds. Add positioning/marking quality to `defend()` and shot-blocking to elite defenders; then retire `gkSaveScale`.
3. **Restarts 62–68 vs ≈ 110** — the sim under-fouls overall (feet ≈ 10, stick ≈ 20/match) and side-ins are rare (the AI seldom plays down the line). Green cards are at the *high* edge because persistent-fouling thresholds (3rd/5th) hit the few players who do foul. Consider raising the thresholds when foul counts rise.
4. **Attacking circle entries 18–22 vs 26–48** — after the definitional fix (attacking entries only) the count is low while shots are high: too many shots per entry, i.e. attackers shoot from the first position rather than working the ball. `shoot` utility base 0.2 could drop; PC share and goals then need re-balancing.
5. **Women's scoreline over-dispersion** — the ±2 level spread is too wide at a 1.8-goal team mean. Use ±1.5 for women or make the spread profile-aware in the batch runner (the real Belgian women's league is also top-heavy: Braxgata/Gantoise vs the rest, so some over-dispersion is real).
6. **Estimates.** Every `EST` row should be replaced by transcribed KBHB/FIH match-report aggregates (open question #17). The FIH altiusrt match-report format carries PCs, circle entries, shots, shots on target and possession per quarter — one season is enough.

## Reproducibility

Every batch is deterministic per seed (`seed + i`); `pnpm calibrate:run` uses seeds 42–137. Changing any engine/AI/rules constant changes the numbers and, usually, the scenario hashes (`scenarios.golden.json`) — update both deliberately and note the reason.

## Re-run after Phase 7 (engine 0.5.0, 2026-08-19)

Phase 7 changed the AI's logs (stamina-driven rotation, bench recovery, a rules fix that ended stalled PCs). Same 96-match protocol:

| metric | men's 0.4.0 → 0.5.0 | women's 0.4.0 → 0.5.0 |
| --- | --- | --- |
| goals / match | 5.4 → **5.42** | 3.6 → **3.61** |
| draw rate | → 0.10 | → 0.21 |
| PC (+PS) goal share | 0.23 → **0.33** (now in band) | → 0.31 |
| PCs / match | 6.4 → 7.16 | → 6.80 |
| PC conversion | → 0.24 | → 0.16 |
| circle entries / match | → 20.2 (MISS, est row) | → 18.4 (MISS, est row) |
| shots / match | → 27.8 | → 32.5 (MISS high, est row) |
| restarts / match | 65 → 71 | → 68 |
| substitutions / match | ≈ 2 → **7.9** | → **9.8** |

**Measured rows all pass for both profiles; the men's PC-share near-miss of Phase 4 is gone** (more PCs, unchanged conversion). The remaining misses are all on `EST` rows (circle entries, women's shots/strokes/greens) and unchanged in character from Phase 4 — see Known deviations. Rotation volume rose from ≈ 2 to 8–10 subs per match at the new default `rotateBelowStamina` 0.7; still below a real club match (open question #15 follow-up: stamina curve).

## Realism pass after Jan's first play-through (engine 0.6.0, 2026-08-19)

Jan's feedback on the deployed build: the play was not hockey (few circle penetrations, odd patterns), the tactics knobs were percentages, no way to set a system or a press. Diagnosis with possession tracing (`docs/handoff/phase-9.1.md`): **most "circle entries" and goals were teams playing the ball into their own D and losing it** — defenders received back passes inside their own circle, dribblers prodded the ball 5 m into the jockeying defender's stick, the defensive block never entered its own circle, and a ball fired at a defender from 2 m was "trapped" by the stick instead of hitting the body. The old numbers passed on nonsense.

Fixed (AI/tactics, all as data or decision weights): no passes into own D; defenders hold the 23 m outlet shape instead of dropping into the D in possession; dribble touches stay on the stick near defenders and nobody dribbles straight into a stick; centre backs get on the ball–goal line when the ball is in the 23; marking of runners in the 23 (with a carrier and on loose balls); "win the corner" — a firm push at a defender's feet is an option; no stick reaction to point-blank balls; midfield tackling toned down; named systems (4-3-3 … 4-2-3-1), press systems (full / half / split / zone) and mentality as first-class tactics; GK scales 1.6 (men) / 1.7 (women); a restart nobody takes is reversed after 20 s (FIH 12.1 delaying — the stall safeguard that the naive-controller women's test needed).

Same 96-match protocol:

| metric | target | 0.5.0 | **0.6.0** |
| --- | --- | --- | --- |
| goals / match (men) | 5.4 | 5.42 | **≈ 5.2–5.5** ok |
| goals / match (women) | 3.6 | 3.61 | **≈ 3.5–3.8** ok |
| PC (+PS) goal share (men, measured) | 0.33 | 0.33 | **0.16 MISS** |
| PCs / match (men) | 9 | 7.2 | **≈ 4 MISS** (was ≈ 2 before the feet/point-blank work) |
| circle entries / match | 36 | 20 | **≈ 12 MISS** |
| shots / match | 24 | 28 | ≈ 31–34 (high) |
| restarts / match | 110 | 71 | ≈ 45 |

**Honest reading:** the structural play is now hockey-shaped (possessions of ~15 touches that progress, entries by carries and passes into the D, defenders in the D, PCs from feet), but the *volume* of circle play and PCs is below the real game. Those are the next tuning targets (attack construction in the 23, more feet/stick fouls under pressure in the D, outlet speed), and they must be tuned on this realistic base — not by re-admitting the own-D giveaways. Measured men's PC share fails until PCs ≈ 7–9.
