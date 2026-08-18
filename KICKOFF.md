# KICKOFF — where we are

> Read this first. Then `BRIEF.md`, then `docs/adr/`, then the latest `docs/handoff/`.

## Current phase: **3 — Players and AI — built; gate awaiting Jan's judgement**

Phases 0–2 are complete (`docs/handoff/phase-{0,1,2}.md`). Phase 3 is **built and green on everything automatable** (`docs/handoff/phase-3.md`): attributes, the circle-warped value function, tactics, a utility-based `Controller` with a goalkeeper model, tackles (obstruction/stick-tackle rules now live), a scripted PC battery with variants, rolling substitutions, and the §6.2 scenario fixtures with regression hashes. Full AI matches play to full time in ~1.3 s, deterministically, across Node/Chromium/Firefox/WebKit (engine 0.3.0, sandbox golden `34f09eb279444e5c`).

**The Phase 3 gate is qualitative and Jan's (BRIEF §8: "Coach's judgement is the acceptance criterion; there is no substitute").** Do not start Phase 4 until it is given.

### How to give the verdict

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

Questions to answer per scenario: *is this hockey?* If a scenario is wrong, name what a coach would expect instead. Record verdicts in `docs/rules/situational-review.md` (create it: scenario id · seed · verdict · what to fix). AI adjustments made in response are Phase 3 work; when the verdicts are "yes, that's hockey", Phase 3 closes and Phase 4 begins.

### Phase 4 (next) — Calibration (BRIEF §8)

`simcli` batch runner (shard across `worker_threads`), statistics aggregation, `docs/rules/calibration-data.md` transcribed from Belgian League + FIH Pro League **men's and women's separately**, `tools/calibrate` comparison with ±10 % bands and a chi-square scoreline shape check, tuning pass per profile. Gate: all §6 metrics within tolerance for `mens` and `womens` independently; `docs/rules/calibration.md` published; switching profile changes only loaded configuration.

## Open questions for Jan

Blocking now:

0. **Phase 3 verdict** (above).

Carried:

1. Situational review panel — three or four coaches, for Phase 5's visual review (and useful now for text logs).
2. Which profile (`mens`/`womens`) calibrates first in Phase 4.
3. Arcade after v1.0 — confirmed by the stub in `apps/arcade`.
4. Current Belgian play-off format — lookup needed for Phase 6.
5. Who does the Blender work — needed before Phase 5 pose rendering (ADR-012).
6. Toolchain bump (ESLint 10 / TS 7 / Vitest 4)? Deferred.
7. Replay storage format (ADR-007 follow-up): events + quantised keyframes at 5–10 Hz, gzip — decide before Phase 5 stores anything.
8–14. Provisional rule readings — see `docs/rules/ruleset.md` § Provisional (now 11 items, incl. stroke-over conditions and second-card-while-suspended).

New from Phase 3:

15. **Substitution policy**: the AI rotates on a time proxy because stamina isn't in the controller view yet. Expose stamina (Phase 4 or 7) and rotate on `TeamTactics.rotateBelowStamina`?
16. **PC variants**: five exist (dragFlick, lowHit, slipRight, slipLeft, deflection). Which two or three matter most for the Belgian game, and what does "the opponent has read you" look like to a coach? (Phase 6/7 design.)

## Decisions log (short form — full argument in `docs/adr/`)

Web-first · headless engine, event log is the contract · PixiJS 8 · 2.5D ball with swept CCD · float64 + lint guardrails · fictional world only · IndexedDB + JSON + linear save migrations, append-only replay schema · Pinia + one Worker + typed postMessage · vue-i18n NL/EN/FR · four test layers incl. determinism & human panel · server-authoritative multiplayer if ever · Blender-to-sprite, layer separation, procedural pitch · interpolation + director camera + moment budget + audio in Phase 5 · **Phase 1:** centre-origin SI coordinates, `End = ±1`; ball centre defines line crossings; PCG32 bit-exact; polynomial deterministic math; golden-hash policy tied to `ENGINE_VERSION` · **Phase 2:** rules are pure (`signals in → rulings out`), physics stays physics; laws as data; time runs through free hits, stops for PC/PS/goal; circle exits applied after the goal decision; injection is not a shot · **Phase 3:** attributes scale physics *inputs*, never physics; the AI is a `Controller` over the view only; value function analytic and shape-tested; passes struck to arrive trappable; PC roles fixed per corner; the AI is the engine's best test harness — keep full matches in CI.
