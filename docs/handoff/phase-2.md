# Handoff — Phase 2: Rules layer

**Date:** 2026-08-18
**Gate:** every rule has ≥1 positive and ≥1 negative test · a match plays start to finish under the laws without an unhandled violation · rules separable from physics · `pnpm check` green · golden-hash policy honoured (`ENGINE_VERSION` 0.2.0, sandbox golden `4bd0c4840e5778f0`) · `docs/rules/ruleset.md` written. **Status: green** — 82 tests (25 rules, 7 full-match integration), and `bullyoff-sim match --matches 5` plays five complete matches at ~1.2 s each.

## What was built

### `@bullyoff/rules` (pure; depends only on `shared`)
- `laws.ts`: every rule constant as data (`FIH_OUTDOOR`, `FIH_OUTDOOR_FAST` for batch sims). PROVISIONAL readings flagged inline.
- `types.ts`: the **narrow interface** — `RulesView` (what rules may see: ball, players, last touch), `TickSignals` (what physics reports: strikes, traps, body contacts, circle entries/exits, goal-line/sideline crossings), `Ruling` (what rules decide: goal, foul, card, restart, deadBall, placePlayers, suspend/reinstate, clock, quarterStart/End, fullTime, PC/PS lifecycle), `RulesState` (serialisable).
- `rules.ts`: `createRulesState`, `gateCommand` (who may play the ball / substitute right now), `stepRules` (the per-tick law engine): quarters & clock & breaks; restarts with set-up waits; **the circle rule**; sideline/backline outcomes (side-in, 15 m hit-out, long corner, PC for intent); fouls from physics signals (feet, dangerous, back-stick, 23 m travel, PC high first hit); PS heuristic; PC and PS sub-machines; cards (explicit + persistent-fouling) with playing-time suspensions and reinstatement.
- `placements.ts`: where the *law* puts players (own half, 5 m, PC behind-line/beyond-halfway/outside-circle, PS beyond 23 m). Only violators move.
- `testkit.ts`: fake-world harness for law tests, reused by nothing else yet but exported.

### `@bullyoff/engine`
- `match.ts` now hosts the rules: builds `RulesView` + `TickSignals`, calls `gateCommand` before physics and `stepRules` after, executes rulings (freeze/place ball, teleport players, dugout for suspensions/subs, score, clock, full time → `MatchEnd`). New: `substitute` command, `face` on strikes, bench players (`onPitch:false`), goalkeepers, `laws`, `firstCentrePass`, `sandbox` mode (Phase 1 physics fixtures + golden hash), `simulateMatch(setup, seed, controller)`, `Controller` type, `rulesView()`.
- `events.ts`: 20 rule events appended (append-only, ADR-007).
- `pitch/geometry` moved to `@bullyoff/shared/pitch` (rules and engine both need it; rules may not import engine).
- `sim/naiveController.ts`: a dumb deterministic controller so full matches can be played *now* — it is not hockey and Phase 3 replaces it.
- `apps/simcli`: `sandbox` and `match [--matches N]` modes with per-match event averages.

## What was decided

- **Rules never see engine internals; the engine never decides law.** Signals in, rulings out. Both pure and serialisable. This held up: the whole rules suite runs on a fake world with no physics at all.
- **Physics stays physics.** A ball off a shin still rebounds; the *rules* call it feet. Body contact now updates `lastTouch` (that's why the golden moved 0.1.0 → 0.2.0).
- **Circle exits are applied after the goal decision** — the backline is also the circle's edge. Found by the full-match test (zero goals from 384 crossings). Documented in code.
- **The PC injection is not the "first shot"**; the first attacker strike from inside the circle after injection is. Found by the rules suite.
- **Time runs through ordinary free hits**, stops for PC/PS/goal set-ups. Suspensions are playing time.
- **Substitutions teleport** to/from the dugout in Phase 2. Phase 3 AI runs players off; the law (dugout zone, PC block) is already enforced.
- Not implemented (needs Phase 3's duel/tackle model): obstruction, stick tackles, third-party; above-shoulder/aerial-receiving specifics; shoot-outs (Phase 6). Reserved in `FoulKind`/`laws`.

## What surprised us

- The naive controller found two real rules bugs in ten minutes that unit tests written from the law alone would not have: the circle-exit ordering and the injection-as-first-shot. **Keep an end-to-end match in the test suite for every phase.**
- The rules suite's own fakes bit back once: a "PC" test produced a stroke because the fake ball sat at (0,0) and the contact looked goal-bound. Rules were right; the test was wrong. Fake worlds must be set up honestly.
- The naive controller produces scorelines like 2-3, 3-2, 1-1 — pure accident of its parameters. Do **not** read anything into it before Phase 4.
- `switch-exhaustiveness-check` forbids a `default` over a wide union in the engine's event fan-out; an if-chain is the honest shape there.

## What Phase 3 should watch out for

1. **The controller interface is `(view, rules, tick) → Command[]`.** The AI is a `Controller`. Keep it that way — arcade input and human coaching commands are the same shape.
2. **`RulesView` is the AI's world too**, plus whatever the AI needs (positions, ball, restart state, score, clock). Extend the view; do not let AI reach into `MatchState`.
3. **Utility AI + spatial value grid (BRIEF §5.4).** The circle-warped value grid is the single most important artefact. Build it as data over the pitch (metres → value), test its shape (value at top of the D ≫ midfield; lanes into the D score high), then let actions consume it.
4. **Attributes 1–20 (BRIEF §5.3) scale strike speed/accuracy, reach, speed, decisions.** Today strikes use profile maxima × power. Introduce attribute → parameter mappings *with tests* (CLAUDE.md rule 8).
5. **Goalkeeper AI as a distinct model**: line position, angle, save reflex as reach vs. ball flight; kicking clearances.
6. **Duels/tackles** are what obstruction and stick-tackle rules need. Model a tackle command with an outcome (win/lose/foul) from attributes + rng; then the two reserved fouls become detectable.
7. **PC variants (BRIEF §5.5)** as designed sequences: injector → trapper → flicker/hitter, runners. Phase 3 needs at least "straight drag flick" and "low hit" so Phase 4 can calibrate PC conversion.
8. **Scenario fixtures (BRIEF §6.2)** get built in this phase (`packages/engine/fixtures/scenarios/`), even though the panel can't judge them until Phase 5.
9. **Performance**: full match ≈ 1.2 s now with a trivial controller. A utility AI evaluating candidates for 22 players per tick could be 10–50× heavier. Budget it: evaluate decisions every N ticks (e.g. 4 = 5 Hz) with per-tick execution, and profile early. Phase 4 wants 10 000 matches.
10. **Open rules questions** are listed in `docs/rules/ruleset.md`; the AI should be tuned against the *provisional* readings but stay parameterised so a confirmed reading is a constant change.
