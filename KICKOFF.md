# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **3 — Players and AI**

Phases 0–2 are complete and green (`docs/handoff/phase-{0,1,2}.md`). The engine plays a full match under the FIH laws (4 quarters, restarts, PC/PS, cards, rolling subs) with a placeholder controller; the log is deterministic and hashed across Node/Chromium/Firefox/WebKit (sandbox golden `4bd0c4840e5778f0`, engine 0.2.0). Rules are pure and separable (`packages/rules`), documented in `docs/rules/ruleset.md` with provisional readings listed for Jan.

### Phase 3 deliverables (BRIEF §8)

Attribute model (1–20, technical/physical/mental/GK + hidden) · utility-based decision layer · **the circle-warped spatial value grid** · team tactical instructions (press height, defensive line, build-up style, PC preferences) · fatigue and its effect on decisions · goalkeeper AI as a distinct model · duel/tackle model (unlocks obstruction/stick-tackle rules) · PC variants as designed sequences (at least drag flick + low hit) · **scenario fixtures for §6.2** built now, judged in Phase 5.

### Phase 3 gate

- Matches produce recognisable hockey shape — sustained circle pressure, counter-attacks, defensive resets — verified by reading event logs in text form. **Coach's judgement (Jan) is the acceptance criterion; there is no substitute.**
- The AI is a `Controller` (`(view, rules, tick) → Command[]`); it reaches nothing beyond the view.
- Attribute → parameter mappings tested; value grid shape tested; determinism intact; a full match with the AI is still deterministic and reasonably fast (target ≤ 5 s/match in Node).
- `docs/handoff/phase-3.md`; scenario fixtures under `packages/engine/fixtures/scenarios/` with a regression hash each.

### Where to start (from the Phase 2 handoff)

1. Extend the view for AI needs (restart state, score, clock, tactics) — never `MatchState`.
2. Value grid as data + tests → utility scoring of {carry, pass to N, shoot, tackle, press, drop, support}.
3. Attributes → strike speed/accuracy, reach, speed, decision quality; fatigue curves. Tests for each mapping.
4. Goalkeeper model. Duels/tackles → obstruction & stick-tackle fouls become detectable.
5. PC variants; substitution AI (players run to the dugout).
6. Scenario fixtures (§6.2 table). Profile the AI; decide decision cadence (5 Hz?).

## Open questions for Jan

Carried (none block Phase 3, but #1 is now urgent):

1. **Situational review panel — three or four coaches, needed for Phase 3's gate and Phase 5's review.**
2. Which profile (`mens`/`womens`) calibrates first in Phase 4.
3. Arcade after v1.0 — confirmed by the stub in `apps/arcade`.
4. Current Belgian play-off format — lookup needed for Phase 6.
5. Who does the Blender work — needed before Phase 5 pose rendering (ADR-012).
6. Toolchain bump (ESLint 10 / TS 7 / Vitest 4)? Deferred.
7. Replay storage format (ADR-007 follow-up): events + quantised keyframes at 5–10 Hz, gzip — decide before Phase 5 stores anything.

New from Phase 2 — **provisional rule readings to confirm** (full list with detail in `docs/rules/ruleset.md`):

8. Green/yellow suspension durations in the Belgian league (2 / 5 min, 10 serious).
9. Free hit inside the attacking 23 m: "5 m travelled *or* touched by another player" before entering the circle?
10. Intent heuristic for a defender's ball over their own backline (own stick from inside the circle = intentional → PC).
11. Feet/body: advantage not modelled — every outfield contact is an offence today.
12. Penalty-stroke heuristic (defender's body stops a goal-bound ball in the circle).
13. Dangerous-play thresholds (0.5 m, 5 m, ±35°); PC drag flick exempt from the danger check.
14. Centre pass alternation by quarter.

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5 · **Phase 1:** centre-origin SI coordinates, `End = ±1`; ball centre defines line crossings; PCG32 bit-exact; polynomial deterministic math; golden-hash policy tied to `ENGINE_VERSION` · **Phase 2:** rules are pure (`signals in → rulings out`), physics stays physics; laws as data; time runs through free hits, stops for PC/PS/goal; circle exits applied after the goal decision; injection is not a shot; subs teleport until Phase 3.
