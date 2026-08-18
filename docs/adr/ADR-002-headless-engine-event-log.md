# ADR-002 — Headless deterministic engine, event log as sole contract

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF constraint C2, §4.2, §4.3.

## Context

Everything downstream — the viewer, commentary, post-match stats, the calibration harness, replays, bug reports, and any future networked mode — needs to see what happened in a match. There are two fundamentally different ways to expose that: let consumers read engine state, or emit a log and make that the only output.

Determinism is a separate but related property: given the same seed and the same tick-stamped inputs, the engine must produce a byte-identical event log. Without it, calibration is statistical noise, bug reports are unreproducible, and replays diverge from what the player saw.

## Options considered

### A. Shared mutable state, renderer reads engine objects directly
- **For:** trivially fast, no serialisation, no event schema to design.
- **Against:** the renderer and UI grow tendrils into the simulation; every refactor of engine internals breaks the view. Replay requires re-simulating (and therefore *perfect* determinism, always). Cannot run the engine in a Worker without a copy anyway. Batch simulation and viewer share nothing.

### B. Snapshot per tick (full state serialised every tick)
- **For:** simple mental model; seek is O(1).
- **Against:** 20 Hz × 70 min × ~30 entities × full state is tens of MB per match. Meaningless for a stat harness that runs 10,000 matches. Encodes *how things are*, not *what happened* — commentary and stats still need to diff snapshots to find events.

### C. Typed event log as the only output; state stays private to the engine
- **For:** the log is small, semantic (`Goal`, `CircleEntry`, `Card`, `PenaltyCornerAwarded`…), and is exactly what stats, commentary and the viewer want. Replay is playback of data, not re-simulation. Batch simulation writes logs; the viewer reads logs; the calibration harness reads logs. Bug reports = seed + input log. Runs identically in Worker, Node, and any future server (ADR-011).
- **Against:** the renderer needs positional data at every tick, so the log must include periodic kinematic events (positions/velocities) — this is not free, but bounded and designed once. Requires discipline: the temptation to "just peek" at engine state must be refused structurally, not by convention.

## Decision

**Option C.** `tick(state, inputs) → { state, events }`. Pure, synchronous, deterministic. The engine's public API returns `MatchEvent[]`; the `state` object is opaque to consumers (an unexported type, or a branded handle). Nothing outside `packages/engine` imports engine internals.

Determinism rules (BRIEF §4.3), enforced by lint where possible:
- One `Rng` (PCG32 or xorshift128+, decided in Phase 1), seeded, serialisable, injected — never global.
- No `Math.random`, `Date.now`, `performance.now`, timers, DOM, I/O in `packages/engine`, `packages/rules`, `packages/shared`. ESLint `no-restricted-properties` / `no-restricted-globals` enforce this today.
- Fixed tick 20 Hz, `dt = 0.05 s`. Elapsed time = `tick × dt`, never a running sum.
- Stable iteration order: arrays sorted explicitly; no `Set`/`Map` iteration where order matters.
- Inputs are tick-stamped, serialisable commands from day one.

## Consequences

- The event schema is a first-class design artefact (Phase 1). It must include enough kinematic data for the renderer to interpolate at 60 fps without touching state — likely a `Kinematics` event per tick carrying positions/velocities of ball and players. Size budget: a full match log should be < 2 MB uncompressed. Measured in Phase 1.
- Replay = deterministic playback of a log; scrubbing backwards is reading earlier events, not reverse simulation.
- Any consumer that needs something not in the log asks for a **new event type**, never for state access.
- The determinism harness (ADR-010) is the test that this ADR is being honoured.
- Cost: an extra layer of indirection and a schema to version (ADR-007 covers versioning). Worth it.
