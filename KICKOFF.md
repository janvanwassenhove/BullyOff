# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **2 — Rules layer**

Phases 0 and 1 are complete and green (`docs/handoff/phase-0.md`, `docs/handoff/phase-1.md`). The engine is a hockey-shaped physics sandbox with a deterministic event log, verified across Node/Chromium/Firefox/WebKit (golden hash `60abc0490dcdf885`).

### Phase 2 deliverables (BRIEF §8)

Circle rule · no offside · obstruction · foot/body contact · dangerous play by ball height · back-stick · self-pass · free hits and the 5 m rule · 23 m restarts · long corners · penalty corners · penalty strokes · cards with timed suspension · four quarters and clock stoppage · unlimited rolling substitutions.

### Phase 2 gate

- A rules test suite where **every rule has at least one positive and one negative case**.
- A match can be played start to finish (4 × 15 min, breaks, restarts) without a rules violation escaping unhandled.
- `packages/rules` stays separable from physics: engine calls rules through a narrow interface; rules never reach into engine internals.
- `pnpm check` green; golden hash policy respected (bump `ENGINE_VERSION`, update `golden.ts` in the same change); `docs/rules/ruleset.md` written; `docs/handoff/phase-2.md` written.

### Where to start (from the Phase 1 handoff)

1. Match state machine: quarters, clock, stoppage, restart sub-states.
2. Narrow `rules` interface: `applyRules(view, tickEvents) → rulings`, engine executes rulings (dead ball, placement, suspension, score).
3. Goal = `GoalLineCrossed.inGoal` ∧ attacker's stick touch inside the circle. Track `lastTouchInCircle`.
4. Dead-ball handling + restarts (centre pass, free hit + 5 m, self-pass, 23 m, long corner, side-in), then PC and PS as first-class sub-machines (PC is BRIEF §5.5's minigame — at minimum the phase machine now, AI later).
5. Fouls from physics signals: `BallCollision{player}` → feet; ball height + proximity → dangerous; stick geometry → back-stick/obstruction (start simple, comment the hockey reason).
6. Cards: green 2 min, yellow 5/10 min, red; `onPitch=false`, `returnTick`; the team plays short.
7. Rolling substitutions: `substitute` command, dugout zone near halfway, no limit.
8. **When a law is ambiguous, ask Jan.** List questions in this file under "Open questions" instead of inventing.

## Open questions for Jan

Carried (unchanged, none blocking Phase 2):

1. Situational review panel — three or four coaches, needed **before Phase 3**.
2. Which profile (`mens`/`womens`) calibrates first in Phase 4.
3. Arcade after v1.0 — confirmed by the stub in `apps/arcade`.
4. Current Belgian play-off format — lookup needed for Phase 6.
5. Who does the Blender work — needed before Phase 5 pose rendering (ADR-012).
6. Toolchain bump (ESLint 10 / TS 7 / Vitest 4)? Deferred; not blocking.

New from Phase 1:

7. **Replay storage format** (ADR-007 follow-up): full-tick frames are ~250 MB/match as JSON. Proposal for Phase 5: events + quantised int16 keyframes at 5–10 Hz, gzip. Needs a decision before the renderer stores anything.
8. **Rules ambiguities will accumulate here during Phase 2** — e.g. exact green/yellow suspension durations in the Belgian league (2 min / 5 or 10 min?), whether the current outdoor rules in force use the "self-pass from a free hit inside the 23 m must travel 5 m before entering the circle" variant, and shoot-out timing details. Phase 2 will list each with the choice made *provisionally* and flagged.

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5 · **Phase 1:** centre-origin SI coordinates, `End = ±1`; ball centre defines line crossings; PCG32 bit-exact; polynomial (not LUT) deterministic math; golden-hash policy tied to `ENGINE_VERSION`.
