# Handoff — Phase 3: Players and AI

**Date:** 2026-08-19
**Gate (BRIEF §8):** matches produce recognisable hockey shape — sustained circle pressure, counter-attacks, defensive resets — verified by reading event logs in text form; **coach's judgement is the acceptance criterion**. Scenario fixtures (§6.2) built now, judged visually in Phase 5.
**Status: built and green on everything automatable — 107 tests, cross-browser determinism (engine 0.3.0, sandbox golden `34f09eb279444e5c`), 13 scenario fixtures with regression hashes, full AI matches in ~1.3 s.** The qualitative half of the gate is **Jan's to give**: run `pnpm simcli scenario <id>` (or `scenario list`) and `pnpm simcli match --matches 5`, read the text logs, and say whether it is hockey. Until that verdict, Phase 4 does not start (CLAUDE.md rule 2 / BRIEF C6).

## What was built

### Attributes (`engine/src/player/attributes.ts`)
1–20 scale, technical/physical/mental/goalkeeper/hidden (BRIEF §5.3), `attributesFor(role, level)` with role emphasis, and tested mappings: `strikeSpeedFactor` (a 20 hits the profile max, a 1 at 55 %), `strikeErrorSd` (1.5°→9°, widened by fatigue and low composure; a push is 2× more accurate than a hit, an aerial 1.2× worse), `trapSuccess` (skill vs incoming speed vs height), `paceFactor/accelFactor/staminaDrainFactor`, `tackleOdds` (win + foul thresholds), `gkReach/gkSaveChance`. The engine applies them at the *inputs* to physics: strike angle noise and speed scaling, trap clean/miscontrol, GK saves (beaten → the ball carries on, slightly deflected), tackle contests, per-player kinematics.

### Engine additions
- `tackle` command → contest resolved by attributes + Rng → `Tackle` event + `TickSignals.tackles` → rules produce **stick tackle** and **obstruction** fouls (previously undetectable). A beaten tackler loses momentum.
- `award` command (scenario/umpire hook), `MatchSetup.startLive` (scenarios begin in open play), `MatchSetup.role/attributes`, `Controller` runs everything.
- Physics fixes found through the AI (all with hockey reasons in code): **air drag applies to the rolling ball** and rolling resistance is realistic (a 30 m/s hit dies within 60–80 m; before, it rolled 140 m+); **a strike brings the ball round in front of the body** (you cannot hit through yourself — this was generating "feet" fouls on the striker); the last toucher's body doesn't foul a slow ball at their feet or a ball moving away from them; miscontrols skid onward, not backwards. `ENGINE_VERSION` 0.2.0 → 0.3.0.

### Rules additions
Penalty stroke over without a goal (saved/stopped/dead → 15 m hit-out) — found via a stalled women's match; PC roles/all-attackers placement at a PC (the 40 s walk compressed); PC timeout safeguard; card stacking extends rather than duplicates. All in `docs/rules/ruleset.md`.

### AI (`engine/src/ai/`)
- `valueGrid.ts` — **the circle-warped value function**: analytic, tested for shape (inside the D ≫ top of the D ≫ 23 m ≫ midfield; symmetric; central beats wide; shot quality from angle/distance/keeper offset).
- `tactics.ts` — `TeamTactics` (pressHeight, defensiveLine, buildUp, pcVariant, tempo, rotateBelowStamina), 4-3-3 slots, `shapeTarget` (attack: push up, forwards to the D; defence: line height, lateral compression).
- `brain.ts` — `aiController(seed, squads, {profile, surface})`: carrier utility over {shoot, pass×N, carry×8, clear} with value gain, lane risk, receiver openness, pressure, decision noise from attributes; **passes are struck to arrive trappable** (`passSpeedFor` inverts the rolling physics); support runs (forwards run *into* the D, midfielders offer behind); pressing/jockeying at 2 m with disciplined tackle timing; loose-ball chasing with braking, receiving and collecting; goalkeeper model (angle, sweeping, saves, clearances); **PC battery** (roles fixed per PC: injector waits for the trapper/striker to set, injection tuned to arrive at ~8 m/s, trapper slides to the line, striker steps in; variants dragFlick / lowHit / slipRight / slipLeft / deflection; defensive runners/postmen; open-play fallback for rebounds); PS taker; restarts; substitutions (players jog to the dugout before the swap; time-based rotation until stamina is exposed to controllers).
- `sim/scenarios.ts` — the §6.2 table as fixtures: outlet under press, high press vs deep block, baseline entry, 2v1, 3v2, PC ×4 variants, PC one man down, last two minutes (GK off, kicking back on, 0-1 down), counter-attack, long corner. Each has `mustLookRight`. `runScenario`. Hashes in `scenarios.golden.json` (regression).
- `simcli`: `match` uses the AI (`--controller naive` for the Phase 2 placeholder); `scenario <id>` prints the text log for review; `scenario list`.

## Numbers as they stand (seed 42, mens/watered, FAST laws — *uncalibrated*, Phase 4 does that)
Circle entries ~60 · strikes inside the D ~35 · goals 1–3 (six seeds: 1-1, 1-2, 1-1, 1-1, 1-1, 1-0) · PCs 7–10 per match, converted occasionally · fouls ~25–50 (feet ~10, stick tackle ~20, obstruction <10, dangerous ~1) · tackles ~150 (won ≈ 1 in 3) · substitutions ~14 · cards 3–10 · 1.3 s per match in Node with a 5 Hz off-ball cadence.

Known deviations to fix in Phase 4, not now: goals are low (real Belgian top division ≈ 4–5 per match total), free hits are few (real ≈ 100+), PC conversion is low, sideline-outs are rare, subs are time-based not fatigue-based.

## What surprised us

- **Every AI iteration found a physics or rules bug**, none of them visible from unit tests: rolling balls without drag, strikes through the striker's own body, miscontrols into shins, PC roles reassigned mid-corner, the trapper counted as "carrier" while the injection rolled past, saved strokes never ending, a GK placed as centre-pass taker that the placeholder controller refused to use. **The AI is the best test harness the engine has.** Keep `simcli match` in the loop for every future change.
- Feet fouls went 100 → 10 per match through *four* separate causes; the last one (ball behind the body at strike time) was invisible without frame-level tracing. Frame dumps (`frameEvery: 1`) plus tiny throwaway diagnostic tests were the tool that worked; keep that habit.
- The value function's "step into the circle" claim needed the staging-zone bonus capped — the test caught my own design drifting.
- Determinism held throughout: not one hash flake across ~40 full-match runs while tuning.

## What Phase 4 should watch out for

1. **The gate is Jan's.** Read scenario logs first: `pnpm simcli scenario two-v-one`, `pc-dragFlick`, `outlet-under-press`, `last-two-minutes`. If a scenario is "not hockey", fix the AI before calibrating numbers — calibrating a wrong shape produces a fitted model (BRIEF §6.1).
2. **Expose stamina to controllers** (view) so rotation becomes fatigue-based; then Phase 7's rotation bar has something to show.
3. **Calibration levers already exist as parameters**: `laws` (persistent-foul thresholds, danger thresholds), profile surfaces/strikes, attribute levels, `TeamTactics`, AI constants (tackle chance, shoot threshold, DECISION_EVERY). Do not add `if (isWomens)`; tune profiles.
4. **Transcribe Belgian League + Pro League aggregates** into `docs/rules/calibration-data.md` (men's and women's separately) before touching any constant. Then `tools/calibrate` compares `simcli match --matches N --json` aggregates with ±10 % bands and a chi-square on scorelines.
5. **Watch performance**: 1.3 s/match now; 10 000 matches ≈ 3.6 h single-threaded. `simcli` should shard across `worker_threads` for batch runs; determinism per match is unaffected.
6. **Scenario hashes will change with every AI/physics tweak.** That is fine and intended — but update `scenarios.golden.json` deliberately with the reason in the commit message, and re-read the affected scenario log before accepting.
7. Open provisional readings for Jan (ruleset.md §Provisional, now 11 items) still stand; Phase 4 tuning should stay parameterised on them.
