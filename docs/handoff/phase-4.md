# Handoff — Phase 4: Calibration

**Date:** 2026-08-19
**Gate (BRIEF §8):** all §6 metrics within documented tolerance, independently for `mens` and `womens`; `docs/rules/calibration.md` published; switching profile changes only configuration.
**Status: substantially met, with honest gaps.** Both profiles hit every *measured* target (goals per match, draw rate, PC share) except one near-miss (men's PC share 0.23 vs ≥ 0.25); of the estimate rows, 9–10 of 12 pass per profile; the men's scoreline shape passes, the women's is over-dispersed. Profile purity is enforced by a test. Full tables and the causality check are in [`docs/rules/calibration.md`](../rules/calibration.md). Note the gate was entered on Jan's explicit waiver of the Phase 3 coach verdict; that verdict is still owed and calibration numbers should be re-read after it.

## What was built

- **`docs/rules/calibration-data.md`** — targets transcribed from public season pages (Belgian HL men/women 2024–25: goals/match 5.4 / 3.6, draw rates ≈ 11 % / 25 %, PC share ≈ ⅓; FIH Pro League 4.76 / 4.22), plus labelled **estimates** for PCs, conversion, circle entries, shots, strokes, cards, restarts, with sources. Machine twin: `tools/calibrate/src/targets.ts`.
- **`engine/src/sim/stats.ts`** — `matchStats(log)` and `aggregate()` (goals, PCs, PC/PS conversion, PC share, attacking circle entries, shots and on-target, cards, fouls, restarts, tackles, subs, team-goal histogram, scorelines). `BallStruck` now carries `x,y` (append-only schema) so shots are classified without frames.
- **simcli `batch`** — sharded across child processes under the tsx loader (Node 22 does not apply `--import` loaders to worker_threads): `--matches N --workers K --level L --spread S --away-level L --out agg.json`; ≈ 0.45 s/match wall on 8 workers.
- **`tools/calibrate`** — `compare(aggregate, profile)` with tolerance bands, a chi-square shape test of the per-team goal distribution against Poisson (regularised-gamma implementation, tested), `formatReport`, CLI `pnpm calibrate <agg.json>`, and `pnpm calibrate:run` for both profiles.
- **Tuning** — see calibration.md "What was tuned": body radius 0.5 m; keeper mapping rebuilt (reflex-dominated, trap cooldown after a beaten save, separate stroke save); flatter accuracy curve; men's flick speed; `profile.calibration.gkSaveScale` (women 1.6, PROVISIONAL); four provisional rules readings; AI lane-risk in the D, three blockers, disciplined tackling; batch quality spread.
- **Tests:** `stats.test.ts`, `profile.test.ts` (no profile-id/isWomens branch outside profile.ts/fixtures — greps engine, rules, shared), `tools/calibrate/src/index.test.ts` (bands, measured-vs-EST, chi-square sanity incl. the χ²(6) 95 % quantile).
- Golden hash 0.4.0 `8b762ab25cd72f6d`; scenario hashes updated with the reason in the commit.

## What was decided

- **Measured vs estimate is a first-class distinction in the harness.** `allMeasuredPass` is the gate signal; EST rows report but should not block until Jan replaces them with transcribed data.
- **A quality spread is part of calibration.** Equal-strength sides give ~20 % draws and a flat scoreline shape; a ±2 level spread reproduces the Belgian men's 11 % draws and Poisson-like shape. Real leagues are uneven — calibrate against uneven sides.
- **`gkSaveScale` is a labelled debt, not a feature.** It carries the women's goal gap the model cannot yet derive; the calibration doc names the mechanism that should replace it (defensive organisation by attributes).
- **Attacking circle entries** are the statistic (ball entering the circle the last toucher's team attacks), not raw `CircleEntry` events.
- Not done: replacing `EST` rows with transcribed FIH match reports (a transcription job for Jan/Phase 4b), 10 000-match runs (96–192 are enough for ±10 % on goals; the runner scales), and a per-scoreline real distribution (Poisson placeholder).

## What surprised us

- **The trap cooldown** — one line ("a beaten keeper doesn't get another roll next tick") — moved goals from 2 to 7 per match. Several earlier "tuning" moves had been fighting that hidden re-save loop.
- **The causality check exposed the model's blind spot immediately**: better attackers score more; better defences barely defend better. Attributes scale attack; they do not yet scale defensive organisation. That is exactly what BRIEF §6.1 said the second source was for.
- Every calibration lever I reached for turned out to be a *behaviour* (attackers not aiming at feet, defenders not blocking, keepers re-saving, strokes not ending, a raised stroke being "dangerous play" at the keeper) rather than a number. The numbers were mostly right; the hockey was missing.
- Ten small rules readings surfaced under statistical pressure that had survived unit tests and full-match tests: they are all in `ruleset.md § Provisional`.

## What Phase 5 should watch out for

1. **The renderer consumes `MatchLog` (events + frames).** Frames are ~1.8 MB per 30 s as JSON — decide the replay storage format first (open question #7): events + quantised int16 keyframes at 5–10 Hz, gzip; the in-memory `Frame` stays as is. `BallStruck.x/y`, `Goal`, `PenaltyCornerAwarded/Taken/Ended`, `Card`, `Clock`, `QuarterStart/End`, `RestartAwarded` are the moment triggers (ADR-013).
2. **The scenario fixtures are the review deck.** `pnpm simcli scenario <id> --json out.json` writes a full log for the viewer; the review panel (open question #1) judges them there. Their hashes are regression-tracked.
3. **Calibration will move again** with any AI/rules change; that is expected. Keep `pnpm calibrate:run` in the loop (it is ~2 min) and re-publish the tables. Consider a nightly CI job (ADR-010) once runtime on CI is measured.
4. **`gkSaveScale` and the causality gap** are the first things to revisit when defensive AI gets attention (Phase 6/7 will touch tactics anyway).
5. `restartsPerMatch` at ~65 means fewer dead-ball moments than real hockey; the renderer/commentary should not assume real-world stoppage rhythm until fouls are re-tuned.
