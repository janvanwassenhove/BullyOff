# Handoff — Phase 1: Engine core

**Date:** 2026-08-18
**Gate:** 100 runs hash identically (Node) and the same hash on Chromium/Firefox/WebKit · rolled ball stops where physics says · 130 km/h from 14 m is a goal at every tested angle · a ball at the post rebounds · no rules yet · `pnpm check` green. **Status: green.** Golden hash `60abc0490dcdf885` (engine 0.1.0) reproduced in Node, Chromium 145, Firefox 153, WebKit — verified locally and wired into CI (`determinism` job).

## What was built

### `@bullyoff/shared`
- `Scalar` + SI aliases, `Vec2/Vec3` helpers.
- `dmath`: deterministic `sin cos tan atan atan2 exp log pow powi pow2i hypot wrapAngle angleDelta` from `+−×÷`, `sqrt`, `floor` and integer ops only. Accuracy vs native ≤ 1e-12 (tested — the test file is the only place native transcendental `Math.*` is called). Polynomial with quadrant/Cody–Waite reduction rather than a LUT: fast enough, and a LUT *built with native Math.sin* would itself be cross-engine non-deterministic — the reason we don't do that is worth remembering.
- `Rng`: PCG32 on two uint32 halves (`Math.imul`, no BigInt). **Bit-identical to the reference C implementation** (first outputs for seed 42/stream 54 = `0xa15c02b7 0x7b47f409 …`; 10k draws vs a BigInt oracle for 5 seed/stream pairs). Serialisable, `fork()` for sub-streams, `gaussian()` via own log/cos.
- `fnv1a64`, `canonicalJson`, `hashValue` — dependency-free log hashing.

### `@bullyoff/engine`
- `constants.ts`: `TICK_HZ=20`, `DT=0.05`, `ENGINE_VERSION='0.1.0'`.
- `profile.ts`: `mens` / `womens` parameter sets (ball, surfaces `dry|watered|wet`, player kinematics, strike speeds). **No `isWomens` branch anywhere** — the whole difference is data. Surface physics is shared by construction (turf doesn't care who plays on it).
- `pitch/geometry.ts`: FIH dimensions, `inCircle` (rect + quarter-discs, line counts as in), `in23`, `inField`, plane-crossing helper, `sweptCircleCrossing` (bisection, deterministic).
- `events/events.ts`: `MatchEvent` union (`MatchStart/End, BallStruck, BallTrapped, BallBounce, BallCollision, CollisionCapHit, CircleEntry/Exit, GoalLineCrossed{inGoal}, SidelineCrossed, BallStopped, Line23Crossed`), `Frame` (flat numeric arrays, stride 7 per player), `MatchLogHeader` (versioned, ADR-007) and `MatchLog`.
- `ball/ball.ts`: 2.5D integrator — airborne gravity + quadratic drag; **touchdown split inside the tick** (bounce then continue); rolling with constant deceleration, exact stopping distance (`d = v²/2a`, asserted to 1e-9).
- `ball/collide.ts`: **swept collision** — segment vs posts (vertical cylinders), crossbar (horizontal cylinder), player bodies (cylinders, striker excluded on the strike tick), earliest-TOI resolution, ≤ 4 resolutions/tick then `CollisionCapHit`; goal box handling once in the net (damping, backboard/net event, never re-crosses); then goal-line, sideline, circle and 23 m crossings evaluated **on the resolved sub-segments in temporal order**.
- `player/player.ts`: kinematics — capped accel/decel, fatigue-scaled top speed, heading turn rate, stick angle follows heading unless aimed, stamina drain ∝ (v/vmax)².
- `match/commands.ts`: tick-stamped serialisable commands (`move, aim, strike, trap, placeBall, placePlayer`).
- `match/match.ts`: `createMatch`, `tick` (fixed intra-tick order: commands sorted → players → ball → sweep), `endMatch`, `simulate`, `captureFrame`.
- `sim/`: `hashLog`, fixtures (`standardLineup`, `sandboxSetup`, `sandboxScript`), `golden.ts`.
- `worker/`: typed `ToEngine/FromEngine` protocol; `createEngineHost(post)` — a pure message handler; `worker.ts` is the 6-line `self` adapter. Host tested against `simulate()` for hash equality and structured-clone safety.
- `browser/determinism.browser.test.ts` + `vitest.browser.config.ts`: Playwright harness across three engines. `pnpm test:browsers`.

### Tooling
- CI: `determinism` job (playwright install --with-deps, `pnpm test:browsers`).
- `apps/simcli`: runs the sandbox, prints hash + event counts; `--json` dumps a log. Runs via `tsx`.
- Perf: 600 ticks ≈ 30 ms → a 70-min match ≈ 4 s in Node with 22 players and no AI. Fine for now; watch it in Phase 3.

## What was decided

- **Coordinates:** origin at centre, +x towards the east goal (`end = +1`, home attacks it), y across, z up. `End = 1 | -1`.
- **Ball "over the line" = centre crosses the line.** FIH says the whole ball; the ~3.6 cm difference is below anything a viewer sees and keeps the sweep simple. `inGoal` also requires the crossing to be inside the posts/under the bar by half a ball radius — posts intercept the rest.
- **Ball–body collisions are physics, not rules.** A ball off a defender's shin rebounds (e = 0.35). Phase 2 decides whether that's a foot foul; Phase 1 just makes it physically real.
- **Frames every tick in memory; storage format deferred.** 30 s of frames is 1.8 MB JSON. A full match ≈ 250 MB — never shipping like that. ADR-007's replay format needs a decision in Phase 5: quantised int16 keyframes at 5–10 Hz plus events (renderer interpolates), gzip'd. `MatchLog.frames` stays the *in-memory* shape.
- **Golden-hash policy:** `SANDBOX_GOLDEN_HASH` is asserted by Node and browser tests. Any intentional engine change that alters logs must bump `ENGINE_VERSION` and update the golden in the same commit — the test message says so.
- **No LUT trig, no `fast-check`** in Phase 1. Polynomial math is accurate and fast; property tests can come when a property is crisp enough to earn them.

## What surprised us

- The mirror test caught a real bug: `inCircle` computed the wrong distance at the west end (`end*HL − end*p.x` instead of `HL − end*p.x`). Symmetry tests for both ends are mandatory from here on.
- Drag matters even at 5–12 m: aiming a test shot at the crossbar "analytically" missed by 7 cm at 12 m. Tests that aim need to account for it or shorten range.
- Canonical-JSON hashing of frames was slower than the simulation itself; frames are now hashed as a flat numeric string (spec-defined number formatting).
- Node's `--experimental-strip-types` won't resolve `.js`→`.ts` workspace imports; `tsx` does.
- No Python on this machine — irrelevant to the product, relevant to how edits get scripted.

## What Phase 2 should watch out for

1. **Rules are predicates over the event stream + state, living in `@bullyoff/rules`, invoked from `tick()` after the sweep.** Keep them separable: `rules` must not import `engine` internals beyond types; the engine calls `applyRules(state-view, events) → rulingEvents + state changes` through a narrow interface. Design that interface first.
2. **The match needs a game-state machine before anything else:** `pre-match → Q1..Q4 with clock → quarter breaks → full time`, plus `restart` sub-states (centre pass, free hit, 23 m restart, long corner, PC, PS, side-in). Clock stoppage rules (PC/PS/injury/card umpire stops) live here.
3. **Circle rule and `GoalLineCrossed`:** a goal = `inGoal` ∧ last touch by an attacker inside the circle (track `lastTouchInCircle` on the ball). Own goals: FIH — the ball must be touched by an attacker's stick *inside the circle* before crossing; a defender's deflection after that still counts. Get this exactly right; it's the identity of the sport.
4. **Ball height is already there for dangerous play / above-shoulder / raised-into-the-D — write predicates on `ball.pos.z` and the `BallStruck.lift`, plus proximity of opponents (`bodies` list).
5. **`BallCollision{surface:'player'}` is the foot/body-contact signal.** Phase 2 turns it into `Foul{kind:'feet'}` when it advantages the offender; leave the physics rebound as-is.
6. **Cards need a suspension timer per player** (`onPitch=false` + a `returnTick`), and rolling substitutions need a bench: `PlayerState.onPitch` exists; the substitution *command* and the sideline dugout zone don't yet.
7. **Restarts need "ball dead" handling:** today the ball keeps rolling after crossing a line. Phase 2 must freeze it, place it, and gate strikes until the restart. Also the 5 m rule for free hits and the self-pass.
8. Every rule: ≥ 1 positive and ≥ 1 negative test (gate). When a law is ambiguous, ask Jan — don't invent.

## Files created / changed in this phase

`packages/shared/src/{scalar,rng,rng.test,hash,hash.test,index}.ts`, `packages/shared/src/math/{index,index.test}.ts` · `packages/engine/src/{constants,profile,index}.ts`, `pitch/{geometry,geometry.test}.ts`, `events/events.ts`, `ball/{ball,ball.test,collide,collide.test}.ts`, `player/{player,player.test}.ts`, `match/{commands,match}.ts`, `sim/{hash,fixtures,golden,determinism.test}.ts`, `worker/{protocol,host,host.test,worker}.ts`, `packages/engine/browser/determinism.browser.test.ts`, `packages/engine/vitest.browser.config.ts`, `packages/engine/{package,tsconfig}.json` · `apps/simcli/src/main.ts`, `apps/simcli/package.json` · `.github/workflows/ci.yml`, `eslint.config.js`, `package.json` (+ `@vitest/browser`, `playwright`, `tsx`), `.gitattributes` · this file, `KICKOFF.md`, `README.md`.
