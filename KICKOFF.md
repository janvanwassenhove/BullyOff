# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **6 — Manager shell** (Phase 5 core built and browser-verified; device/perf + coach review owed; Phase 3's coach verdict still owed)

Phase 5 (`docs/handoff/phase-5.md`): replay format decided (events + 5 Hz quantised keyframes), `packages/render` MatchView (procedural pitch in metres, interpolation, director camera, moments, HUD, playback/scrub, synth audio), manager viewer with the engine in a Web Worker (simulate a match / run a §6.2 scenario / load-export replays), and a Playwright browser test that renders frame-accurately in Chromium, Firefox and WebKit (screenshots in `docs/handoff/img/`). Owed: fps on a mid-range phone, coach panel on the scenario deck, real assets (sprites, SFX).

Phases 0–4 are built (`docs/handoff/phase-{0..4}.md`). Jan waived the Phase 3 coach gate on 2026-08-19 to let calibration proceed; **the verdict is still owed** and calibration should be re-read after it. Phase 4 (`docs/handoff/phase-4.md`, `docs/rules/calibration.md`): batch runner (`pnpm simcli batch`), statistics, `tools/calibrate` with bands + chi-square, targets transcribed (measured + labelled estimates), tuning pass — **both profiles hit every measured target except men's PC share (0.23 vs ≥ 0.25)**; profile purity enforced by test; engine 0.4.0, sandbox golden `8b762ab25cd72f6d`. Known deviations ranked in calibration.md (PC awards ≈ 6.4 vs 9; defensive quality does not scale with attributes → the Pro League causality check only partly passes; restarts ≈ 65 vs 110).

### Phase 6 deliverables (BRIEF §8)

Season structure **with play-offs built first** (regular round-robin phase → title play-off bracket + relegation play-downs; single- and two-legged ties; shoot-outs as tie-breaker), fixture generation (two modes), league tables, squad management, training focus, youth academy and progression, player development and decline, injuries, amateur-hockey pressures (studies, availability, volunteers), club finances at an honest amateur scale, the winter break as a real interval. Persistence per ADR-007 (IndexedDB + JSON + migrations).

### Phase 6 gate

Ten seasons simulate end to end without corruption, incl. play-off brackets, shoot-out resolution, and promotion/relegation between two tiers; youth players emerge, develop, plateau and retire believably; a regular-phase winner losing the play-off final must be possible and feel earned.

### Where to start

1. Confirm the Belgian play-off format (open question #4) — from the 2024–25 pages: men top-4 semis + final, two relegated; women top-4, two-leg final, relegation play-off vs the second tier. Model both as data.
2. A season model in a new `packages/season` (or inside `worldgen`): clubs, squads, fixtures (round-robin + bracket), tables, tie-breakers, shoot-out (engine: `laws.shootOutTicks`; a shoot-out controller/rules sub-machine is needed — 8 s one-on-ones).
3. Match day pipeline: unwatched fixtures → worker `simulateAi` with `frameEvery: 0` → `matchStats`; the user's fixture → full log → MatchView.
4. Player development: attributes (1–20) + hidden (`potential, lifePressure, …`) already exist; write the season-tick development/decline model with tests before any UI.
5. Persistence: IndexedDB wrapper + versioned save + migration runner (ADR-007) with round-trip tests.

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
0b. **Phase 5 device check + coach review** — run `pnpm dev:manager` on a phone (Vite `--host`), watch a match at 1×–8×; run the scenario deck with the panel.

Carried:

1. Situational review panel — three or four coaches, for Phase 5's visual review (and useful now for text logs).
2. Which profile (`mens`/`womens`) calibrates first in Phase 4.
3. Arcade after v1.0 — confirmed by the stub in `apps/arcade`.
4. Current Belgian play-off format — lookup needed for Phase 6.
5. Who does the Blender work — needed before Phase 5 pose rendering (ADR-012).
6. Toolchain bump (ESLint 10 / TS 7 / Vitest 4)? Deferred.
7. ~~Replay storage format~~ — decided in Phase 5: events + 5 Hz quantised keyframes (`ReplayFile` v1), gzip on export.
8–14. Provisional rule readings — see `docs/rules/ruleset.md` § Provisional (now 15 items; Phase 4 added: raised shots at the keeper, feet on a lifted ball to mid-thigh, the stroke heuristic, a beaten keeper's touch).

New from Phase 3:

15. **Substitution policy**: the AI rotates on a time proxy because stamina isn't in the controller view yet. Expose stamina (Phase 4 or 7) and rotate on `TeamTactics.rotateBelowStamina`?
16. **PC variants**: five exist (dragFlick, lowHit, slipRight, slipLeft, deflection). Which two or three matter most for the Belgian game, and what does "the opponent has read you" look like to a coach? (Phase 6/7 design.)

New from Phase 4:

17. **Replace the `EST` calibration rows with transcribed data** — one season of FIH/KBHB match reports (PCs, circle entries, shots, shots on target, cards, restarts). `docs/rules/calibration-data.md` § C lists them; `tools/calibrate/src/targets.ts` is the twin to update.
18. **PC award frequency** (6.4 vs ≈ 9 real): the AI under-fouls in the D. Coach's view wanted on *why* PCs happen at club level (feet on shots, stick tackles, deliberate over-the-line) so the AI can be steered at the right cause.
19. **`gkSaveScale`** (women 1.6) — a provisional knob for the part of the women's goal gap not explained by shot speed. Accept until defensive organisation is modelled, or prefer a different mechanism?
20. **Quality spread** in calibration runs (±2 levels): is that the right picture of the Belgian top division's spread (Braxgata/Gantoise vs the rest)? A per-club level table would let calibration mirror the real league.

New from Phase 5:

21. **Kit colours and pitch palette** — placeholders now (red/blue, water-blue turf). Club colours come from worldgen (Phase 8); a real palette pass with the wordmark face belongs to the art direction (ADR-012).
22. **Auto-pause defaults** for the coach (goal? PC? cards?) — the option exists (`autoPauseOn`); which events should pause by default in the manager?

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5 · **Phase 1:** centre-origin SI coordinates, `End = ±1`; ball centre defines line crossings; PCG32 bit-exact; polynomial deterministic math; golden-hash policy tied to `ENGINE_VERSION` · **Phase 2:** rules are pure (`signals in → rulings out`), physics stays physics; laws as data; time runs through free hits, stops for PC/PS/goal; circle exits applied after the goal decision; injection is not a shot · **Phase 3:** attributes scale physics *inputs*, never physics; the AI is a `Controller` over the view only; value function analytic and shape-tested; passes struck to arrive trappable; PC roles fixed per corner; the AI is the engine's best test harness — keep full matches in CI · **Phase 4:** measured vs estimate targets, `allMeasuredPass` is the gate signal; calibrate against uneven sides (`--spread`); attacking circle entries; `gkSaveScale` is labelled debt; effective body radius 0.5 m; trap cooldown after a beaten save · **Phase 5:** world in metres, camera is the only scale; frame-accurate = deterministic draw at a tick (`renderFrame`); 5 Hz quantised keyframes for storage, full-tick frames live; honest placeholders (capsules, synth SFX); no ResizeObserver around the canvas.
