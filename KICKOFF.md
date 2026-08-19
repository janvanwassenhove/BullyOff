# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **5 — Renderer** (Phase 4 done with documented gaps; Phase 3's coach verdict still owed)

Phases 0–4 are built (`docs/handoff/phase-{0..4}.md`). Jan waived the Phase 3 coach gate on 2026-08-19 to let calibration proceed; **the verdict is still owed** and calibration should be re-read after it. Phase 4 (`docs/handoff/phase-4.md`, `docs/rules/calibration.md`): batch runner (`pnpm simcli batch`), statistics, `tools/calibrate` with bands + chi-square, targets transcribed (measured + labelled estimates), tuning pass — **both profiles hit every measured target except men's PC share (0.23 vs ≥ 0.25)**; profile purity enforced by test; engine 0.4.0, sandbox golden `8b762ab25cd72f6d`. Known deviations ranked in calibration.md (PC awards ≈ 6.4 vs 9; defensive quality does not scale with attributes → the Pro League causality check only partly passes; restarts ≈ 65 vs 110).

### Phase 5 deliverables (BRIEF §8)

PixiJS view layer consuming event logs: tiled turf with vector lines, wet/dry visual state, modular player sprites (body/stick/shadow), runtime tinting, ball with height-derived shadow, camera follow, speed control 1×–8×, scrub/seek, auto-pause triggers. **Presentation is first-class (§10, ADR-012/013): interpolation, director camera, moment budget (goal, PC, shoot-out, final whistle), audio in this phase.**

### Phase 5 gate

Any saved event log replays frame-accurately, scrubs both ways, 1×–8×, 60 fps on a mid-range phone; no visible 20 Hz stepping; a goal *feels* like a goal. Plus the situational review (§6.2) with the coach panel on the scenario fixtures.

### Where to start

1. Decide the replay storage format (open question #7) — events + quantised keyframes at 5–10 Hz, gzip — and write the encoder/decoder in `packages/engine` (or `shared`) with a round-trip test.
2. `packages/render`: `MatchView(canvas, log)` with an interpolation buffer (1-tick latency), procedural pitch from shared geometry, capsule placeholder sprites with tint, ball + shadow, director camera (spring), speed/scrub API. Frame-accurate = the same tick shows the same picture on every device.
3. Moment system for Goal / PC / (shoot-out later) / final whistle; event-driven audio layer with placeholder SFX.
4. `apps/manager`: a match viewer page loading a log from `simcli --json` or from the engine worker; the scenario deck for the review panel.

### The still-owed Phase 3 verdict

```bash
pnpm simcli scenario list
```

```bash
pnpm simcli scenario two-v-one
```

Read a handful of scenario logs (`pc-dragFlick`, `outlet-under-press`, `baseline-entry`, `counter-attack`, `last-two-minutes`) and a few whole matches:

```bash
pnpm simcli match --matches 5
```

Questions to answer per scenario: *is this hockey?* If a scenario is wrong, name what a coach would expect instead. Record verdicts in `docs/rules/situational-review.md` (create it: scenario id · seed · verdict · what to fix). AI adjustments in response re-run `pnpm calibrate:run` (numbers will move; re-publish calibration.md).

## Open questions for Jan

Owed:

0. **Phase 3 verdict** (above) — waived on 2026-08-19 to proceed, still wanted.

Carried:

1. Situational review panel — three or four coaches, for Phase 5's visual review (and useful now for text logs).
2. Which profile (`mens`/`womens`) calibrates first in Phase 4.
3. Arcade after v1.0 — confirmed by the stub in `apps/arcade`.
4. Current Belgian play-off format — lookup needed for Phase 6.
5. Who does the Blender work — needed before Phase 5 pose rendering (ADR-012).
6. Toolchain bump (ESLint 10 / TS 7 / Vitest 4)? Deferred.
7. Replay storage format (ADR-007 follow-up): events + quantised keyframes at 5–10 Hz, gzip — decide before Phase 5 stores anything.
8–14. Provisional rule readings — see `docs/rules/ruleset.md` § Provisional (now 15 items; Phase 4 added: raised shots at the keeper, feet on a lifted ball to mid-thigh, the stroke heuristic, a beaten keeper's touch).

New from Phase 3:

15. **Substitution policy**: the AI rotates on a time proxy because stamina isn't in the controller view yet. Expose stamina (Phase 4 or 7) and rotate on `TeamTactics.rotateBelowStamina`?
16. **PC variants**: five exist (dragFlick, lowHit, slipRight, slipLeft, deflection). Which two or three matter most for the Belgian game, and what does "the opponent has read you" look like to a coach? (Phase 6/7 design.)

New from Phase 4:

17. **Replace the `EST` calibration rows with transcribed data** — one season of FIH/KBHB match reports (PCs, circle entries, shots, shots on target, cards, restarts). `docs/rules/calibration-data.md` § C lists them; `tools/calibrate/src/targets.ts` is the twin to update.
18. **PC award frequency** (6.4 vs ≈ 9 real): the AI under-fouls in the D. Coach's view wanted on *why* PCs happen at club level (feet on shots, stick tackles, deliberate over-the-line) so the AI can be steered at the right cause.
19. **`gkSaveScale`** (women 1.6) — a provisional knob for the part of the women's goal gap not explained by shot speed. Accept until defensive organisation is modelled, or prefer a different mechanism?
20. **Quality spread** in calibration runs (±2 levels): is that the right picture of the Belgian top division's spread (Braxgata/Gantoise vs the rest)? A per-club level table would let calibration mirror the real league.

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5 · **Phase 1:** centre-origin SI coordinates, `End = ±1`; ball centre defines line crossings; PCG32 bit-exact; polynomial deterministic math; golden-hash policy tied to `ENGINE_VERSION` · **Phase 2:** rules are pure (`signals in → rulings out`), physics stays physics; laws as data; time runs through free hits, stops for PC/PS/goal; circle exits applied after the goal decision; injection is not a shot · **Phase 3:** attributes scale physics *inputs*, never physics; the AI is a `Controller` over the view only; value function analytic and shape-tested; passes struck to arrive trappable; PC roles fixed per corner; the AI is the engine's best test harness — keep full matches in CI · **Phase 4:** measured vs estimate targets, `allMeasuredPass` is the gate signal; calibrate against uneven sides (`--spread`); attacking circle entries; `gkSaveScale` is labelled debt; effective body radius 0.5 m; trap cooldown after a beaten save.
