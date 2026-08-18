# ADR-010 — Testing strategy: unit, determinism harness, calibration harness, situational review

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF §6, §6.2, and every phase gate.

## Context

This project's only real asset is being *right about hockey*. Three different failure modes threaten that, and one kind of test does not cover them all:

1. **Local wrongness** — a function computes the wrong number (friction, circle geometry, card timer). Caught by unit tests.
2. **Non-determinism** — the same seed produces different logs, on the same machine or across browsers. Silent, corrosive, and it invalidates every other measurement. Caught only by a dedicated harness.
3. **Global wrongness** — every function is locally right, but the emergent match is not hockey: wrong PC frequency, wrong scoreline shape, or right numbers reached through passages of play no coach recognises. Caught by calibration statistics (aggregate) and by human situational review (frame by frame). Neither substitutes for the other.

There is also a temptation to skip the last two because they are slower and less comfortable than unit tests. This ADR exists to make them non-optional.

## Options considered

- **Unit tests only** — cheap, fast, and blind to modes 2 and 3. Insufficient by itself.
- **Snapshot-everything (golden logs for whole matches)** — catches unintended change but freezes tuning; every deliberate parameter change rewrites every golden. Useful in a narrow role (determinism hash), harmful as the main strategy.
- **Property-based testing (fast-check)** for physics/rules invariants — attractive for things like "swept collision never tunnels" and "circle predicate is symmetric under pitch reflection". A dependency, and slower. **Adopt selectively** in Phase 1–2 for geometry/physics invariants; not everywhere.
- **Statistical harness + human panel** — the only things that address mode 3. Slow, unglamorous, mandatory.

## Decision

Four layers, all required; each phase gate names which apply.

### 1. Unit and property tests — Vitest, everywhere
- Every package. Co-located `*.test.ts`. Node environment for `engine/rules/shared/worldgen` (nothing DOM-shaped may leak into `tick()`); jsdom/happy-dom only for `render`/apps when needed.
- **Every rule gets ≥1 positive and ≥1 negative case** (Phase 2 gate).
- **Every tuning constant has a test asserting its effect** (CLAUDE.md rule 8) — e.g. "watered surface stops a 10 m/s ball further than dry".
- Property tests (`fast-check`) for physics/geometry invariants where the property is crisp: no tunnelling, energy never increases in a bounce, circle membership stable under reflection. Introduced in Phase 1 with an ADR-lite note in the handoff if it earns its place.

### 2. Determinism harness — Phase 1, CI on Node + Chromium + Firefox + WebKit
- Fixture: seed + setup + scripted inputs. Run **100×** in-process; hash (SHA-256 over the canonical JSON of the event log); all hashes must be equal. Then run once per browser via Playwright and compare against the Node hash.
- Any divergence fails CI. Same-engine divergence is a bug, full stop. Cross-browser divergence is triaged per ADR-005 (likely a banned `Math.*` slipping through, or a `Set`/`Map` order dependence).
- Also asserts: `Rng` serialises/deserialises to an identical stream; the log is byte-identical after a save/load round-trip.

### 3. Calibration harness — Phase 4, `apps/simcli` + `tools/calibrate`
- `simcli run --profile mens|womens --matches N --seed S` produces aggregate JSON; `calibrate` compares against `docs/rules/calibration-data.md` targets (Belgian League + FIH Pro League, men's and women's separately, never pooled — BRIEF §5.0, §6.1).
- Tolerances: **±10 %** on frequencies (goals, PCs, PC conversion, circle entries, shots, cards); **chi-square** shape test on scoreline distribution; draw rate and shoot-out conversion within band. Sample sizes recorded per metric.
- Runs in CI as a **nightly** job (too slow for every push) and blocks the Phase 4 gate. Results published in `docs/rules/calibration.md`.
- Also a **causality check**: two elite, evenly matched sides must move the metrics toward Pro League values. A model that only fits the Belgian numbers is fitted, not causal.

### 4. Situational review — Phase 3 fixtures, Phase 5 verdicts, human panel
- Scenario fixtures (BRIEF §6.2 table): seed + initial state + tactics per named situation (outlet under press, PC each variant, 2v1 in the circle, last two minutes a goal down, shoot-out, …). Stored under `packages/engine/fixtures/scenarios/`. Each is *also* a regression test: its log hash is tracked, and a change that alters it must be reviewed (not auto-accepted).
- Reviewed in the viewer by **three or four coaches who are not Jan** (open question 1). Verdicts recorded in `docs/rules/situational-review.md` with seed, verdict, fix.
- **A rejected scenario blocks the phase gate**, exactly like a failed tolerance.

### Coverage
- Coverage is reported (v8) but **not gated** — the gates above are more meaningful than a percentage. If coverage of `packages/engine` drops below ~80 %, treat it as a smell to explain in the handoff.

## Consequences

- CI (`.github/workflows/ci.yml`): `typecheck → lint → test → build` on every push (Phase 0, done); `determinism` job across browsers (Phase 1); `calibrate` nightly (Phase 4).
- The situational review depends on a human panel — a project risk that must be recruited before Phase 3.
- Cost: real. Calibration and review are the slow parts of the project. They are also the parts that make it worth doing.
