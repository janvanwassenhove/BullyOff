# Handoff — Phase 8: World generation

**Date:** 2026-08-19
**Gate (BRIEF §8):** a generated world has no string that matches the real-club blocklist; squads and tables look like Belgian club hockey to a coach (tier spread, ages, GK/outfield ratios); the 20-season history is internally consistent (champions, promotions = relegations); generation is deterministic per seed and fast enough for a phone.
**Status: every testable half is met by test (`packages/worldgen/src/index.test.ts` 8 tests, `packages/season/src/season.test.ts` "generated history (Phase 8)"); "looks like Belgian club hockey to a coach" is a judgement — owed with the other reviews.** 2 000 generated identities over 40 seeds and 4 flavours pass the blocklist; a 20-season women's world generates in ≈ 0.6 s on a laptop (test budget 4 s; phone measurement is Phase 9's), is deterministic, keeps 12/12 tiers, honours == history, squads 18–22 with a keeper, ages 15–40, tier means on the calibrated scale (tier 1 ≈ 12.9, tier 2 ≈ 9.9).

## What was built

- **`packages/worldgen`** (was a stub)
  - `blocklist.ts` — `REAL_CLUBS` (Belgian clubs across divisions **and the towns they are named after**, Dutch/German/Spanish/French/British/Irish/Italian/other European top flights), `normaliseName` (NFD fold, lower-case, punctuation → tokens), `significantTokens` (drops generic hockey words: hc/hockey/club/royal/koninklijke/…), `isBlocked` / `blockedBy` (token match, plus substring match for blocked tokens ≥ 5 letters so "Kampongveld" is still Kampong). Add, never remove. **No person names live here** (ADR-006: maintaining one would itself be a list of people).
  - `names.ts` — first-name pools per gender × language (`nl fr en de es it in`), surname pools per language, `NATIONALITY_WEIGHTS` (BEL ≈ 84 %, NED 5, FRA 3, GER/ESP/ARG 1.5, GBR/IRL/AUS/NZL/IND/ITA sprinkle), `nationalityTable(flavour)` shifting the Belgian nl/fr split (`mixed 62/38 · vlaanderen 85/15 · wallonie 15/85 · bruxelles 35/65`), `generatePersonName(rng, gender, flavour)` (12 % of Belgians carry a surname from the other community).
  - `clubs.ts` — invented towns from place-name **morphology** (Flemish heads + tails, Walloon heads + tails incl. `-la-Neuve`, `-lez-Chênes`, `-sur-Vesdre` patterns), club-name patterns (`Koninklijke/K./KHC`, `Royal/R./Royal HC`, `HC/Hockey/Hockey Club/Hockeyclub`, optional English animal nickname as Belgian clubs do), `PALETTE` of 24 kit pairs, badge seed (shape/motif/split), founding year 1906–2006, unique short codes. `generateClubIdentities(rng, n, flavour, year)` re-rolls blocklist hits and reports them.
- **`packages/season`** now depends on worldgen:
  - `Club` gained `town, lang, nickname, badge, founded, honours {titles[], promotions[]}`; `World.flavour`. `SAVE_VERSION` **2** with migration 1 → 2 (defaults for old saves; tested).
  - `createWorld(seed, profile, { flavour, historyYears, … })` → identities + names from worldgen; **`generateHistory(world, years)`**: plays N seasons with the labelled quick resolver through the *real* season loop (play-offs, shoot-outs, promotion/relegation, development, retirement, youth intake, finances), so today's squads, levels, tables and honours grew out of that past. `finishSeason` records honours from now on too.
  - Fixes the long-horizon loop needed (found by running 20 seasons): **squad regulator** (`regulateSquads`: first squads 18–22, youth ≤ 8; surplus players move to the thinnest squad — an amateur transfer — or stop; every club keeps a keeper, graduating a youth keeper early or retraining the weakest outfielder), **growth capped at potential** (facilities/coaching get you there sooner, not further), **youth intake 2–4** with a keeper when the club is short, **relative rating scale** (`normaliseLevels`: tier-1 mean anchored at 12.5 and tier-2 at 10 — "ratings are relative to the top flight of the day", as every 1–20 scale is — nudged by half the drift per season, ±0.6 max), **finances rebalanced** (fee € 250/member, upkeep grows with facilities², "other" ≈ 25–40 % of income: a volunteer board spends what it has; facilities no longer all drift to 5).
- **Manager app**: world generation moved to the season worker (`create` message, 20 seasons ≈ 0.6 s off the UI thread) with flavour and history-length options in career setup; club picker shows town, founding year, nickname, titles; **club colours** now reach the coach view and the replay viewer (`Coaching.colours`, `match.colours`).

## What was decided

- **Worldgen owns identity and names; season owns the loop and the history.** `createWorld` is still the single API; `generateHistory` is the season loop itself — no second simulation of the past.
- **The blocklist includes towns**, because the generator composes towns and a real town name is the most likely accidental collision ("Waterloo HC"). Cost: a few generic Walloon tails (`-la-Neuve`) re-roll sometimes; measured < 15 % raw hit rate, zero after re-roll.
- **Ratings are relative** (tier anchors). This is a modelling stance worth a line in the manual: a 13 today is a 13 against today's top flight.
- **History is quick-resolved**, labelled in code and docs (`quickRunner`, never the engine); results and summaries are kept, replays are not.

## What surprised us

- The Phase 6 development loop was fine for one season and wrong for twenty: squads ballooned to 40–70 (intake > retirement), club levels inflated +3 in 20 years (growth beyond potential via facilities), every club reached facilities 5 (finances always positive), a club could end up without a goalkeeper. Twenty seasons is the test any career model needs before it ships.
- Place-name morphology produces believable Belgian towns ("Groendonk", "Préfontaine", "Sart-les-Prés") and, once in a while, something a Belgian would smile at ("Chêneies-le-Haut"). A human pass over the part pools is cheap and worth it (owed).

## What Phase 9 should watch out for (and what Phase 8 still owes)

Owed to close Phase 8:
1. **A Belgian eye on the name pools** — towns, club patterns, nicknames; any that read as a real club or place should go on the blocklist or out of the pool.
2. **Phone timing** of `createWorld(…, { historyYears: 20 })` (the worker keeps the UI responsive; the number still matters for first-run).
3. **Badges** are seeds only (`Club.badge`); a tiny procedural badge renderer (SVG) for the club picker/HUD belongs with the art pass (ADR-012).
4. Generated history stores summaries; a "records" view (biggest win, longest unbeaten run) needs per-season tables kept — cheap to add (`history[].table`) if wanted.

For Phase 9 (ship):
5. Name pools and the blocklist are plain data — i18n (NL/EN/FR UI) does not touch them; only UI strings move.
6. Save version 2 is the first version a shipped build will read; keep `MIGRATIONS` growing linearly, never edit a past migration.
7. The privacy statement (ADR-006 § consequences) can now point at concrete facts: no real clubs (blocklist + tests), generated names from common-name pools, no telemetry.
