# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **8 — World generation** (Phase 7 deterministic-instructions gate met by test; touchline review owed; Phase 3/5/6 human reviews still owed)

Phase 7 (`docs/handoff/phase-7.md`): stamina in the controller view + bench recovery; stamina-driven rotation; `CoachInstruction` (tactics patch / substitute / swapSlots) applied by the AI at a tick — the only way a coach touches a match; `createAi` handle; PC battery preferences; step-wise coached worker mode (`initAi/advance/instruct/end`) proven bit-identical to `simulateMatch`; `quarterStats`; renderer `coach` mode + live append; manager **CoachView** (tactics, PC designer, rotation bar, quarter briefings, three view modes) wired into the season (coach today's fixture → recorded like any other). A rules bug that stalled a match forever (PC still active after a no-goal crossing) was found and fixed; engine **0.5.0**, sandbox golden `51e34b89dcb71850`.

Phase 6 (`docs/handoff/phase-6.md`): `packages/season` — play-offs-first fixtures, tables, real-engine match days, shoot-outs, development, finances, promotion/relegation, versioned saves; manager career shell. Phase 5 (`docs/handoff/phase-5.md`): replay format, `packages/render` MatchView, three-browser test. Phases 0–4 built (`docs/handoff/phase-{0..4}.md`); Jan waived the Phase 3 coach gate on 2026-08-19 — **the verdict is still owed**.

### Phase 8 deliverables (BRIEF §8)

World generation: fictional clubs (names, colours, badges, towns, histories — **no real club or player, C3**; a real-club/real-player blocklist enforced by test), generated squads with plausible attribute and age distributions per tier, leagues/tiers wired to the season model, and **20 seasons of generated history** (tables, champions, promotions, records) so a new career starts in a world with a past. Name pools for NL/FR-speaking Belgium (Phase 9 i18n), GDPR-clean (BRIEF §7).

### Phase 8 gate

A generated world has no string that matches the blocklist; squads and tables look like Belgian club hockey to a coach (tier spread, ages, GK/outfield ratios); the 20-season history is internally consistent (every champion was in tier 1 that year, promotions match relegations); generation is deterministic per seed and fast enough for a phone (< 2 s).

### Where to start

1. Replace the placeholder generator in `packages/season/src/world.ts` with `packages/worldgen` (the stub exists): name pools (`towns`, `suffixes`, first/last names by language), colour palettes, badge seeds; keep `createWorld(seed, profile, opts)` as the API the app and tests use.
2. Blocklist: `packages/worldgen/src/blocklist.ts` — Belgian clubs (all divisions), Dutch/European well-known clubs, national-team players of the last 20 years; test that no generated club/person name matches (normalised, diacritics-folded, token-wise).
3. History: generate 20 seasons backwards with the labelled quick resolver (`quickRunner`) and the real promotion/relegation rules, then age the squads forward so the present squads are consistent with the past (careers, retirements).
4. Club colours into the coach view and MatchView (`homeColour/awayColour`).
5. Wire `apps/manager` career setup to worldgen options (region flavour, seed) and show club history in the club picker.

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
16. **PC variants**: five exist (dragFlick, lowHit, slipRight, slipLeft, deflection) and the coach can now pick variant + battery per match. Which two or three matter most for the Belgian game, and what does "the opponent has read you" look like to a coach? (AI read-and-counter still to design.)

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
22. **Auto-pause defaults** for the coach — Phase 7 chose quarter breaks only (briefings); goals/PCs are moments. Change?

New from Phase 7:

26. **Tactics knobs a Belgian coach expects** — press triggers, outlet side, man-marking the drag-flicker, "pull the keeper" at the death (the engine supports kicking back; the AI doesn't decide it yet). Which first?
27. **Instruction list in the replay** (`ReplayFile` v2) so coached replays are self-describing — worth the format bump now or at Phase 9?

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5 · **Phase 1:** centre-origin SI coordinates, `End = ±1`; ball centre defines line crossings; PCG32 bit-exact; polynomial deterministic math; golden-hash policy tied to `ENGINE_VERSION` · **Phase 2:** rules are pure (`signals in → rulings out`), physics stays physics; laws as data; time runs through free hits, stops for PC/PS/goal; circle exits applied after the goal decision; injection is not a shot · **Phase 3:** attributes scale physics *inputs*, never physics; the AI is a `Controller` over the view only; value function analytic and shape-tested; passes struck to arrive trappable; PC roles fixed per corner; the AI is the engine's best test harness — keep full matches in CI · **Phase 4:** measured vs estimate targets, `allMeasuredPass` is the gate signal; calibrate against uneven sides (`--spread`); attacking circle entries; `gkSaveScale` is labelled debt; effective body radius 0.5 m; trap cooldown after a beaten save · **Phase 5:** world in metres, camera is the only scale; frame-accurate = deterministic draw at a tick (`renderFrame`); 5 Hz quantised keyframes for storage, full-tick frames live; honest placeholders (capsules, synth SFX); no ResizeObserver around the canvas.
