# Handoff — Phase 6: Manager shell

**Date:** 2026-08-19
**Gate (BRIEF §8):** ten seasons simulate end to end without corruption, incl. play-off brackets, shoot-out resolution and promotion/relegation between two tiers; youth players emerge, develop, plateau and retire believably; a regular-phase winner losing the play-off final must be possible and feel earned.
**Status: structural gate met by test (`packages/season/src/season.test.ts`, 11 tests, part of `pnpm check`).** Ten seasons with the quick resolver: two 12-club tiers stay exactly 12/12, 1–2 clubs go each way every season, shoot-outs are always decisive, ≥ 50 retirements, youth grow into ≥ 11 overall, tier-1 level > tier-2, deterministic per seed. The real engine is exercised on a whole 12-fixture match day and a full 4-club season with kept replays. "Feels earned" is a human judgement — owed with the Phase 3/5 reviews.

## What was built

- **`packages/season`** — pure, deterministic season model on top of the engine (no DOM, no clocks; RNG streams derived from `world.seed`).
  - `model.ts` — `World` (clubs, persons, season, history, `userClub`), `Club` (tier, level, reputation, facilities, tactics, finances, surface), `Person` (attributes incl. hidden `potential/lifePressure/…`, availability, injuries, youth flag), `Fixture` (phase `regular | playoff-semi | playoff-final | playdown`, tie/leg, result incl. `shootOut`, `stats`, optional `replay`), `SeasonHistory`.
  - `fixtures.ts` — **play-offs first**: `roundRobin` (circle method, home/away alternation), `generateFixtures` (double round-robin, 22 rounds, **winter break days 11–14 as a real interval**), `generatePlayoffs` (top-4 semis 1v4/2v3 + final; **two-leg final for the women's profile** — data, not branches), `generatePlaydown` (second-last vs tier-2 runner-up, two legs). Belgian format per open question #4 (men top-4 + final, women top-4 + two-leg final; the play-down is modelled for both since a two-tier world needs a valve).
  - `table.ts` — standings with FIH/KBHB-style tie-breakers (points, wins, goal difference, goals for, head-to-head), `tieAggregate`.
  - `matchday.ts` — `selectSquad` (formation slots from fit/available players, deterministic per fixture seed), `engineRunner` (**the real engine**: `simulateMatch` + `aiController`, `FIH_OUTDOOR_FAST`, club tactics, kept `ReplayFile` for the user's fixtures only), `quickRunner` (**Poisson resolver, labelled — never the engine**), `resolveShootOut` (5 + sudden death; taker elimination/composure vs keeper one-on-one/reflexes), `applyInjuries`, `playFixture` (goals/minutes/injuries land on persons).
  - `develop.ts` — `developSeason`: growth to hidden potential ×(coachability, facilities), plateau, decline from ~30, **`lifePressure` bumps at 18/22/26** driving availability and early drop-out (BRIEF §5.3 amateur pressures), retirement, youth promotion, `overall`, `recomputeClubLevels`.
  - `finance.ts` — honest amateur euros: membership fees, a sponsor, facilities/travel/coaching costs; a fat balance buys a facility level, a broke club loses one. No transfer market.
  - `season.ts` — `advanceDay` (plays a day; winter break heals + tiny physical uptick; regular done → play-offs; ties settled with aggregate → shoot-out), `finishSeason` (champion, promotion/relegation with the tier-balance fix below, history row), `newSeason` (development, finances, youth intake, fresh fixtures), `playSeason`.
  - `save.ts` — `SaveFile` v1 (`format: 'bullyoff-save'`, `version`, `engineVersion`, `profile`, `world`), `serialize/deserialize`, migration runner (0 → 1 adds `history`), refuses newer saves. Round-trip and resume-identically tested.
- **`apps/manager`** — season screen: `stores/season.ts` (Pinia; `newWorld/pickClub/playDay/playToEnd/nextSeason/save/load/export/import`), `engine/season.worker.ts` (a second Web Worker runs match days with the real engine and returns the world + the user's decoded log), `engine/persist.ts` (IndexedDB `bullyoff` → `saves`/`settings`, `navigator.storage.persist()`), `components/SeasonView.vue` (career setup: profile/seed/saved slots/import → club picker → header bar with Play match day / Sim to season end / Next season / Watch my last match / Save / Export → tabs table · squad · fixtures · history), `App.vue` nav Season ↔ Viewer — **"Watch my last match" hands the kept replay to Phase 5's MatchView**.

## What was decided

- **The season package never touches the DOM or a clock.** `serialize()` takes `createdAt` as an argument; the app supplies it. Everything else is seed-derived.
- **Replays only for the user's fixtures** (open question in phase-5 §5): other fixtures keep `MatchStats` (cheap, `matchStats(log)`); the user's keep a `ReplayFile` (5 Hz keyframes). Save files stay small enough for IndexedDB and JSON export.
- **Two runners, one interface** (`MatchRunner`). The engine runner is the default in the app; the quick resolver exists for structural tests and (later) instant-sim of far-away days — it is labelled in code and docs and must never be mistaken for the sim.
- **Tier balance:** if the tier-2 champion is also the club that must play the play-down (impossible by construction now, but it surfaced in an earlier draft), promote the beaten finalist rather than leave a tier short. Test asserts 12/12 every season.
- **Placeholder world** — `world.ts` uses deliberately generic Flemish/Walloon town-ish name pools and a shortlist blocklist test; Phase 8's worldgen replaces names, colours, badges, history and adds the proper real-club blocklist (C3).
- **Saves per ADR-007**: IndexedDB for slots, JSON export/import for portability, `SAVE_VERSION` + `MIGRATIONS` table.

## What surprised us

- A ~50 s synchronous test (a whole engine season) starves the Vitest worker RPC heartbeat ("Timeout calling onTaskUpdate"). Yielding to the event loop between match days (`setImmediate`) fixed it — the same yielding the season worker should do for progress reporting.
- A placeholder town pool needs the same care as the real blocklist: one name (`Waterloop`) read too close to a real club and was renamed. Phase 8 must grep against a real list, not a hunch.
- Standings need head-to-head as a tie-breaker far more often than expected over 22 rounds; without it a 12-club table had frequent dead heats.

## What Phase 7 should watch out for (and what Phase 6 still owes)

Owed to close Phase 6:
1. **"Feels earned"** — a human plays a career for a few seasons (`pnpm dev:manager` → Season). Does losing the final after topping the table read as fair? Are development curves believable in the squad tab?
2. **Training focus UI** — the development model takes facilities/coachability; a per-club training focus knob (technical/physical/tactical) exists in spirit but not in the UI. Small addition once Phase 7 defines the coaching surfaces.
3. Instant-sim of far-away match days in the app currently uses the engine for everything (12 matches ≈ 15–20 s per day in the worker). Either shard across two workers or offer the labelled quick resolver as an explicit "quick sim" toggle.
4. Progress reporting from the season worker (a `progress` message per fixture) so "Sim to season end" shows a bar instead of a spinner.

For Phase 7 (in-match coaching):
5. **Stamina must reach the controller view** (open question #15) before a rotation bar can mean anything; the substitution policy currently rotates on a time proxy.
6. The season worker gives the user's fixture a full log; Phase 7 wants to *drive* that match tick by tick with coach commands. `simulateMatch` already takes a `Controller`; add a step-wise host mode (`step(n)`) to the worker protocol rather than a second engine entry point.
7. PC designer needs the five PC variants exposed with per-player roles from the squad (`selectSquad` order is the current implicit battery).
8. Quarter briefings: `matchStats` per quarter is already computable from events; add a `quarter` breakdown to `aggregate` before UI work.
