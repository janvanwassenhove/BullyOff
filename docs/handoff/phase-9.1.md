# Handoff — Phase 9.1: Realism and tactics pass (after the first play-through)

**Date:** 2026-08-19 · engine **0.6.0** · sandbox golden `e872b9301b4cfd6e` · save format **v3**

Jan's feedback on the live build: (1) gameplay not realistic — few circle penetrations, odd play; (2) no way to set a playing system / press (4-4-2, 5-3-1, split press, half-court press…), the percentage sliders and "build-up" options are not how a coach talks; (3) not clear which colour is your team.

## What was found (possession tracing, `apps/simcli` one-offs)

- ≈ 500 possessions per match of ~8 touches gaining 6 m; only 10 of them reached the D. Turnover pattern #1: a 3 m/s dribble prod followed immediately by an opponent's trap — the carrier pushed the ball into the jockeying defender's stick. Pattern #2: defenders in possession dropped *into their own circle* (shape clamp) and received back passes there; of 68 raw circle entries in a match, 34 were a team entering its **own** D. Goals and "entries" in the Phase 4 calibration were largely that.
- After fixing those, attacks arrived but nothing hit anybody: the defensive block's lower clamp stopped at the top of the D, so the only defender in the D was one chaser; shots at defenders' feet were "trapped" by the stick at point-blank range — zero PCs.
- A naive-controller women's test stalled: the foul-happy test controller got a whole team suspended and nobody could take the centre pass — a genuine engine hole (a restart nobody takes lived forever).

## What was built

- **Tactics as a coach names them** (`packages/engine/src/ai/tactics.ts`): `formation` (`4-3-3 · 3-4-3 · 4-4-2 · 5-3-2 · 3-3-3-1 · 4-2-3-1`, slot tables + `assignSlots` by role; a formation instruction reshapes the on-pitch XI), `press` (`full` full-court · `half` half-court · `split` split press — first defender closes from the inside shoulder, block shifts across · `zone` deep block), `mentality` (`defensive · balanced · attacking` — line height, forwards' commitment, clear/backwards weights), `presetPatch` maps them onto the numeric `pressHeight/defensiveLine` the AI already reads; build-up relabelled as *through the middle / over the top / via the flanks*, tempo as *low / normal / high*. Clubs in worldgen draw a system/press/mentality (4-3-3 dominant). Save migration 2 → 3 adds them to old clubs.
- **AI realism** (`brain.ts`, `tactics.ts`): no passes into own D (−0.6 unless under real pressure); defenders hold the 23 m outlet shape in possession (never below 17 m, wide when the ball is deep); dribble prods are short near defenders and straight-into-a-stick carries are penalised; centre backs take the ball–goal line 3.5 / 6.5 m goal-side when the ball is in the 23; marking of runners in the 23 (`assignMarks/markRunner`, both with a carrier and on loose balls); **win-the-corner** shot option (a push at a defender's feet within 4.5 m of the shooting line); **no stick reaction at point-blank range** (a ball fired from < 4 m at > 8 m/s reaches the body first — that is the feet foul); passes/carries into the D weighted up; midfield tackling toned down (committed tackles in the 23/D).
- **Rules safeguard**: `laws.restartTimeoutTicks` (20 s) — a restart nobody takes is reversed to the other team (FIH 12.1 delaying); `RestartReversed` event; test. `FIH_OUTDOOR_SHORT_TEST` (4-minute quarters) for whole-season tests; `engineRunnerWith(laws)`.
- **UI**: HUD shows `■ ESP 1 – 0 GRO ■` with kit-colour chips; the coach bar shows both clubs with chips, yours underlined plus a "you ■" badge; tactics panel = system / press / mentality / build-up / tempo selects in NL/EN/FR hockey terms; rotate-below stays a slider.
- Vitest: forked pool + short-quarter season test (the long sync tests starved the worker heartbeat).

## Calibration (see `docs/rules/calibration.md` § Realism pass)

Goals per match back in band for both profiles (GK scales 1.6 / 1.7). PCs ≈ 4 (target 9), PC goal share 0.16 (measured target 0.33 — **MISS**), circle entries ≈ 12 (target 36). The base is now realistic; the volume is the next tuning job.

## Next (not done)

1. More circle play: attack construction in the 23 (baseline runs, pull-backs, the far-post winger), earlier entries; target 25–35 entries.
2. More PCs: stick-tackle fouls in the D under pressure, more bodies on the line; target 7–9 and PC share ≈ 0.3.
3. Press systems need a coach's eye: does the split press read as a split press from the tactical camera?
4. Shots per match (≈ 32) include every struck ball inside the D — tighten `isShot` (a 5 m/s lateral pass in the D is not a shot) and re-baseline.
