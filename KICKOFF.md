# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **v1.0 candidate with the commercial UI — ship when the phone pass is done** (phases 0–10 built; human/device reviews owed)

Phase 10 (`docs/handoff/phase-10.md`): the commercial redesign from `docs/design/handoff/` shipped end to end — tokens + self-hosted type, projected pitch cameras in `packages/render`, app shell + season hub, `packages/insight` + post-match report with replay-rendered thumbnails, club select / world generation / title / onboarding / intro, and the touchline instrument panel. Generated imagery (key art, intro poster, onboarding, portraits) lives in `apps/manager/public/` as webp. Play-through fixes: kit clash → away second kit, coached match completes the round, scorer credit on deflected goals (engine **0.6.1**, golden `d25ed4f0e573169c`), 1-based matchdays, i18n leaks. `pnpm check` 167 tests green.

Phase 9.1 (`docs/handoff/phase-9.1.md`): realism + tactics pass after Jan's first play-through — named systems/press/mentality, AI no longer gives the ball away in its own D, defenders in the D, win-the-corner, point-blank feet, restart-timeout safeguard, HUD/coach bar show which colour is yours. Engine **0.6.0**, golden `e872b9301b4cfd6e`, save v3. Calibration: goals in band; PCs/entries still low (next tuning, see calibration.md).

Phase 9 (`docs/handoff/phase-9.md`): PWA (precached app shell + engine/season workers, prompt-style updates, install button, generated icons), i18n **NL / EN / FR** for every UI string (names and rules stay data), About & privacy page (ADR-006 statement), first-run onboarding, phone render cap, season-end progress, GitHub Pages deploy workflow on push to `main`, `docs/release.md` checklist. `pnpm check` 151 tests green; `pnpm test:browsers` green.

Earlier phases: 8 worldgen + 20-season history (`phase-8.md`), 7 in-match coaching (`phase-7.md`), 6 season/career shell (`phase-6.md`), 5 renderer/replay (`phase-5.md`), 0–4 engine/rules/AI/calibration (`phase-{0..4}.md`). Engine **0.5.0**, sandbox golden `51e34b89dcb71850`, save format **v2**.

### What remains before tagging v1.0.0

1. **Enable GitHub Pages** in the repo settings (Source: GitHub Actions); the first push to `main` after that publishes `https://janvanwassenhove.github.io/BullyOff/`.
2. **The phone pass** — `docs/release.md` § On a phone.
3. **The owed reviews** (0–0e below) — none blocks the build; all shape v1.1.
4. Tag `v1.0.0` (commands in `docs/release.md`).

### After v1.0 (BRIEF v1.x)

Arcade front-end on the same engine worker (`apps/arcade` stub; reuse `CoachInstruction`/`Command`), club mode (ADR-006 option D, local-only), replay v2 with the instruction list, records view, quick-sim toggle, stamina-curve tuning + re-calibration, PC read-and-counter AI, real art assets (ADR-012).

**Adaptive play** — the answer to "the engine is deterministic, so does anything ever learn?": **ADR-014** (proposed, needs Jan's acceptance) fixes where learning may live without giving up reproducibility; **`docs/design/adaptive-play.md`** is the build plan, in order: naturalness (commitment, softmax, anticipation, timed runs) → in-match opponent model → fitted policy weights via `pnpm fit` → season learning (experience-driven growth, training focus, familiarity, scouting, adaptive AI clubs). It subsumes open questions 16, 25 and 26 and the PC read-and-counter item above. Nothing starts before v1.0 is tagged.

**`docs/design/hockey-systems.md`** comes first in that plan and is the tactical-correctness half: today the AI presses with "the two players nearest the ball" in every system, has no marking outside its own 23, no free man and no rest-break, and exactly one PC running-out system. It specifies press systems (full / half / split / zone and their variants), the assignment model (man / zone / lane / free / rest-break instead of ball-chasing), PC defence systems (runnerLeads / keeperLeads / doubleCharge / block), circle-entry patterns, and stick handedness — all as data. **§10 there: all three hockey readings confirmed 2026-08-22** — press systems as written; all four PC defence systems are played and the uitloper guesses *both* his line and his body height (so the uitloopsysteem becomes a coach knob, with the counter matrix in §5); stick handedness gets its own phase at full scope (pressing angle, tackle side, receiving, carrying, striking). Nothing there waits on hockey any more — only on accepting ADR-014 and on order/timing.

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
0d. **Phase 7 touchline review** — coach a match from the bench (Season → Coach today's match): PC designer, rotation bar, tactics knobs — what is missing for a Belgian club coach?
0e. **Phase 8 name-pool review** — a Belgian eye on `packages/worldgen/src/{clubs,names}.ts`: towns, club patterns, nicknames that read as real should go on the blocklist or out of the pool.

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

15. ~~**Substitution policy**~~ — closed in Phase 7: stamina is in the controller view; the AI rotates on `rotateBelowStamina` (default 0.7). Still open: the stamina curve drains too gently for realistic rotation volume (4–8 subs vs dozens).
16. **PC variants**: five exist (dragFlick, lowHit, slipRight, slipLeft, deflection) and the coach can now pick variant + battery per match. Which two or three matter most for the Belgian game, and what does "the opponent has read you" look like to a coach? (AI read-and-counter designed in `hockey-systems.md` §5; the uitloper's line + height is what gets read.)

New from Phase 4:

17. **Replace the `EST` calibration rows with transcribed data** — one season of FIH/KBHB match reports (PCs, circle entries, shots, shots on target, cards, restarts). `docs/rules/calibration-data.md` § C lists them; `tools/calibrate/src/targets.ts` is the twin to update. **Blocks the fitting layer from being worth much** (ADR-014 layer A fits against these targets; nine of fourteen are still guesses).
18. **PC award frequency** (6.4 vs ≈ 9 real): the AI under-fouls in the D. Coach's view wanted on *why* PCs happen at club level (feet on shots, stick tackles, deliberate over-the-line) so the AI can be steered at the right cause. `hockey-systems.md` §6 (tackle sides) is the proposed mechanism.
19. **`gkSaveScale`** (women 1.6) — a provisional knob for the part of the women's goal gap not explained by shot speed. Accept until defensive organisation is modelled, or prefer a different mechanism?
20. **Quality spread** in calibration runs (±2 levels): is that the right picture of the Belgian top division's spread (Braxgata/Gantoise vs the rest)? A per-club level table would let calibration mirror the real league.

New from Phase 6:

23. **Quick sim toggle** — the app runs every fixture through the engine (≈ 15–20 s per match day). Offer the labelled Poisson resolver for far-away days, or shard workers? Preference?
24. **Play-down for the women's tier** — modelled like the men's for a two-tier world; is a straight relegation truer to the women's format?
25. **Training focus** — which knobs would a Belgian club coach expect (technical/physical/tactical/PC battery)? The development model is ready for one input.

New from Phase 5:

21. **Kit colours and pitch palette** — placeholders now (red/blue, water-blue turf). Club colours come from worldgen (Phase 8); a real palette pass with the wordmark face belongs to the art direction (ADR-012).
22. **Auto-pause defaults** for the coach — Phase 7 chose quarter breaks only (briefings); goals/PCs are moments. Change?

New from Phase 8:

28. **Relative rating scale** — tier anchors (12.5 / 10) keep twenty generated seasons on the calibrated scale. Acceptable modelling stance for the manual ("a 13 is a 13 against today's top flight")?
29. **History depth and records** — 20 seasons of summaries are generated; keeping per-season tables would enable a records view at ≈ +30 KB per save. Wanted for v1.0?
30. **Region flavour** — mixed / Vlaanderen / Wallonie / Bruxelles shifts names only. Should it also shift club-name patterns (e.g. fewer "Royal" in Vlaanderen) or surfaces/finances?

New from Phase 7:

26. **Tactics knobs a Belgian coach expects** — press triggers, outlet side, man-marking the drag-flicker, "pull the keeper" at the death (the engine supports kicking back; the AI doesn't decide it yet). Which first? (`hockey-systems.md` §3 proposes the press triggers; the PC defence knob is §5.)
27. **Instruction list in the replay** (`ReplayFile` v2) so coached replays are self-describing — worth the format bump now or at Phase 9?

New from the adaptive-play review (2026-08-22):

31. ~~**Accept ADR-014?**~~ — **Accepted 2026-08-22.**
32. **Phase 11 is built but NOT merged** (`docs/handoff/phase-11.md`, branch `claude/phase-11-press-systems`): pressing systems as data + the assignment model. `pnpm check` green, but goals per match fell 5.49 → 4.33, out of the calibration band, because the defensive half shipped without §7's attacking patterns. Choose: finish §7 on that branch before merging (recommended), or merge and let the fitting layer re-tune. Remaining order: handedness (11b) → naturalness (12) → reads (13) → fitting (14) → season (15). But the naturalness pass is ~2 days and changes how every match looks — it may belong first, or even inside v1.0, since it is what the first play-through noticed.
33. **Complexity budget for the tactics screen.** A `pcDefence` knob plus press-system controls means more for the coach to set. May that screen grow, or is there a ceiling?

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5 · **Phase 1:** centre-origin SI coordinates, `End = ±1`; ball centre defines line crossings; PCG32 bit-exact; polynomial deterministic math; golden-hash policy tied to `ENGINE_VERSION` · **Phase 2:** rules are pure (`signals in → rulings out`), physics stays physics; laws as data; time runs through free hits, stops for PC/PS/goal; circle exits applied after the goal decision; injection is not a shot · **Phase 3:** attributes scale physics *inputs*, never physics; the AI is a `Controller` over the view only; value function analytic and shape-tested; passes struck to arrive trappable; PC roles fixed per corner; the AI is the engine's best test harness — keep full matches in CI · **Phase 4:** measured vs estimate targets, `allMeasuredPass` is the gate signal; calibrate against uneven sides (`--spread`); attacking circle entries; `gkSaveScale` is labelled debt; effective body radius 0.5 m; trap cooldown after a beaten save · **Phase 5:** world in metres, camera is the only scale; frame-accurate = deterministic draw at a tick (`renderFrame`); 5 Hz quantised keyframes for storage, full-tick frames live; honest placeholders (capsules, synth SFX); no ResizeObserver around the canvas.
