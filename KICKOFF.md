# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **7 — In-match coaching** (Phase 6 structural gate met by test; "feels earned" human review owed; Phase 3's coach verdict and Phase 5's device check still owed)

Phase 6 (`docs/handoff/phase-6.md`): `packages/season` — play-offs-first fixtures (double round-robin with a real winter break, top-4 semis + final, two-leg final for the women's profile, two-leg play-down), tables with tie-breakers, match days through the **real engine** (labelled Poisson quick resolver only for structural tests), shoot-outs, injuries, development/decline/life-pressure/retirement/youth intake, amateur finances, promotion/relegation across two tiers, versioned saves with migrations. Manager app: career setup → club picker → play match day / sim to end / next season, table/squad/fixtures/history tabs, IndexedDB slots + JSON export/import, "Watch my last match" into the Phase 5 viewer. Ten seasons run clean under test; the engine plays whole match days and a short season in-test.

Phase 5 (`docs/handoff/phase-5.md`): replay format (events + 5 Hz keyframes), `packages/render` MatchView, manager viewer with the engine in a Web Worker, three-browser Playwright test. Owed: fps on a phone, coach panel on the scenario deck, real assets.

Phases 0–4 are built (`docs/handoff/phase-{0..4}.md`). Jan waived the Phase 3 coach gate on 2026-08-19; **the verdict is still owed**. Phase 4: both profiles hit every measured calibration target except men's PC share (0.23 vs ≥ 0.25); engine 0.4.0, sandbox golden `8b762ab25cd72f6d`.

### Phase 7 deliverables (BRIEF §8)

In-match coaching: substitution rotation bar (stamina-driven), penalty-corner designer (variants + roles), quarter briefings, three view modes (director / tactical / coach), pause-and-instruct at set pieces; every instruction is a `Command` into the same deterministic engine — no side channel.

### Phase 7 gate

A coach can change a match's course from the bench with legal instructions only, the result stays deterministic for the same instructions, and the substitution/PC tooling reads like the touchline of a Belgian club match.

### Where to start

1. **Stamina into the controller view** (open question #15) — the rotation bar and `rotateBelowStamina` need it; keep the AI's time-proxy fallback for a bit-exact golden.
2. A **step-wise worker mode** (`step(n)`, `command(...)`) in `packages/engine/src/worker/protocol.ts` + host: the season worker hands the user's fixture to it instead of simulating in one go; the season store resumes when the match ends.
3. PC designer: expose the five variants and battery roles from `selectSquad`; the AI's opponent read (open question #16) is a data flag first.
4. Quarter briefings: add a per-quarter breakdown to `matchStats/aggregate` (events carry ticks; quarters are laws data) before any UI.
5. Coach view = tactical camera + intent overlays (pass lanes, press height); reuse `MatchView` modes.

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
0c. **Phase 6 "feels earned"** — play a career for three or four seasons (`pnpm dev:manager` → Season); judge play-off drama and development curves.

Carried:

1. Situational review panel — three or four coaches, for Phase 5's visual review (and useful now for text logs).
2. Which profile (`mens`/`womens`) calibrates first in Phase 4.
3. Arcade after v1.0 — confirmed by the stub in `apps/arcade`.
4. ~~Current Belgian play-off format~~ — modelled in Phase 6 as data (men top-4 + final; women top-4 + two-leg final; play-down vs tier 2). Confirm against the current KBHB regulations.
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

New from Phase 6:

23. **Quick sim toggle** — the app runs every fixture through the engine (≈ 15–20 s per match day). Offer the labelled Poisson resolver for far-away days, or shard workers? Preference?
24. **Play-down for the women's tier** — modelled like the men's for a two-tier world; is a straight relegation truer to the women's format?
25. **Training focus** — which knobs would a Belgian club coach expect (technical/physical/tactical/PC battery)? The development model is ready for one input.

New from Phase 5:

21. **Kit colours and pitch palette** — placeholders now (red/blue, water-blue turf). Club colours come from worldgen (Phase 8); a real palette pass with the wordmark face belongs to the art direction (ADR-012).
22. **Auto-pause defaults** for the coach (goal? PC? cards?) — the option exists (`autoPauseOn`); which events should pause by default in the manager?

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5 · **Phase 1:** centre-origin SI coordinates, `End = ±1`; ball centre defines line crossings; PCG32 bit-exact; polynomial deterministic math; golden-hash policy tied to `ENGINE_VERSION` · **Phase 2:** rules are pure (`signals in → rulings out`), physics stays physics; laws as data; time runs through free hits, stops for PC/PS/goal; circle exits applied after the goal decision; injection is not a shot · **Phase 3:** attributes scale physics *inputs*, never physics; the AI is a `Controller` over the view only; value function analytic and shape-tested; passes struck to arrive trappable; PC roles fixed per corner; the AI is the engine's best test harness — keep full matches in CI · **Phase 4:** measured vs estimate targets, `allMeasuredPass` is the gate signal; calibrate against uneven sides (`--spread`); attacking circle entries; `gkSaveScale` is labelled debt; effective body radius 0.5 m; trap cooldown after a beaten save · **Phase 5:** world in metres, camera is the only scale; frame-accurate = deterministic draw at a tick (`renderFrame`); 5 Hz quantised keyframes for storage, full-tick frames live; honest placeholders (capsules, synth SFX); no ResizeObserver around the canvas.
