# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **1 — Engine core**

Phase 0 is complete and green (`docs/handoff/phase-0.md`). Do not touch Phase 2+ concerns.

### Phase 1 deliverables (BRIEF §8)

Pitch geometry · 2.5D ball physics with height and surface-state friction · **swept (continuous) collision detection** for the ball · player kinematics · stick as an oriented segment · fixed 20 Hz tick loop · seeded serialisable `Rng` · `MatchEvent` type system and log header · Web Worker harness · determinism harness.

### Phase 1 gate

- 100 runs of a fixture scenario produce identical event-log hashes (Node), and the same hash on Chromium, Firefox and WebKit in CI.
- A ball pushed at a known velocity on a known surface stops where physics says it should (analytic tolerance test, per surface state).
- A ball fired at 130 km/h from 14 m registers a goal at every tested angle; a ball fired at the post rebounds rather than passing through.
- No rules yet — this is a hockey-shaped physics sandbox.
- `pnpm check` green; `docs/handoff/phase-1.md` written.

### Where to start (from the Phase 0 handoff)

1. `MatchEvent` schema + versioned log header (ADR-002, ADR-007) — before physics.
2. `Rng` (PCG32), `Scalar`, `shared/math` LUT trig with tolerance tests vs native (ADR-005).
3. Pitch geometry in metres (BRIEF §5.1) as pure data + predicates (`inCircle`, `crossedGoalLine` on a swept segment).
4. Ball integrator + swept collision vs goal plane/posts/crossbar/backboard/boards; the two acceptance tests written red first (ADR-004).
5. Player + stick kinematics (discrete; no AI, scripted inputs only).
6. Tick loop; tick-stamped input commands; event emission.
7. Determinism harness in Vitest, then Playwright job in `ci.yml` (ADR-010).
8. Worker adapter (ADR-008) — thin, typed, engine stays worker-ignorant.

## Open questions for Jan

Carried from BRIEF §11 (unchanged, none blocking Phase 1):

1. Situational review panel — three or four coaches, needed **before Phase 3**.
2. Which profile (`mens`/`womens`) calibrates first in Phase 4.
3. Arcade after v1.0 — confirmed by the stub in `apps/arcade`; keep guarding it.
4. Current Belgian play-off format — lookup needed for Phase 6.
5. Who does the Blender work — needed before Phase 5 pose rendering (ADR-012).

New from Phase 0 (small, non-blocking):

6. Toolchain bump? Newer majors exist (ESLint 10, TS 7, Vitest 4). Phase 0 stayed on ESLint 9 / TS 5.9 / Vitest 3. Fine to defer.
7. Property-based testing (`fast-check`) — adopt selectively in Phase 1 for physics invariants? ADR-010 leaves it to Phase 1's judgement.

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5.
