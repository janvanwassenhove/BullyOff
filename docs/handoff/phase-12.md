# Handoff — Phase 12: competitions of Europe

Jan's brief: alongside the Belgian league, develop Dutch, English, French and German competitions; a nations competition in a different, Pro League-like format; and for the national competitions, playoffs and a European club competition. All shipped as data on the existing season machinery.

## What a world contains now

- **Five national leagues on one calendar.** The user's chosen country carries the full pyramid (two tiers of twelve, promotion, relegation, the play-down); the other four are a single top flight of twelve each — 72 clubs, ~1,730 persons. Each league closes with the title final four the real Belgian/Dutch/German/French top flights use (England modelled the same; the differences that matter are the pyramid, not the bracket). `leaguesOf(w)` is the single source for what exists.
- **Country identity end to end** (worldgen): invented towns in each country's own morphology (Dutch polder tails like *-drecht/-veen*, English *-worth/-bury*, German *-hausen/-heim*), club-name cultures (MHC/HV in the Netherlands, HTC/TSV in Germany, Stade/AS/Racing in France, plain town + HC in England, Koninklijke/Royal at home), and per-country nationality tables so a German squad is mostly Germans with the sprinkling of foreigners club hockey really has. Towns and short codes are reserved world-wide — a European bracket never shows two identical codes. Blocklist applies everywhere.
- **The European knockout**: eight entrants (the user's country sends two, every other league one, the rest filled by the best remaining top-flight sides; from season two, last season's champions outrank on seeding). Quarter-finals, semis and final are played as a block in the winter break — the way real European hockey plays its KO rounds — as ordinary fixtures (`phase: 'eu-*'`), so **the user's European tie is coachable like any Saturday**.
- **The nations competition**: nine national sides (BEL NED GER GBR FRA ESP ARG AUS IND) in a double round robin spread across the season — Pro League format: no tiers, no playoffs, the table decides. A nation's strength follows the best fourteen players of that nationality anywhere in the world (`buildNations`, refreshed every season), so the club game feeds the international one. Matches resolve off-screen with the labelled Poisson model.
- **History across all of it**: 20 generated seasons crown five league champions plus Europe and the nations every year (`SeasonSummary.foreignChampions/europeChampion/nationsChampion`), honours land on the clubs.

## The seams a maintainer must know

- **Cost control**: `AdvanceOptions.runnerFor` picks the runner per fixture. The season worker runs the user's country (and any fixture the user's club is in, Europe included) through the engine and everything else through `quickRunner` — a sim day stays ~6–12 engine matches. Foreign fixtures therefore have results but no `MatchStats`; the scout already handles statless fixtures honestly.
- **Ties are keyed per league**: five leagues share tie numbers, so every knockout lookup filters on `country` too (`settleKnockout`) — the bug the first test run caught (the Belgian final never resolved because its semi aggregated a Dutch leg).
- **Level normalisation is pinned on the user's league** and the same shift is applied world-wide per tier — the calibrated scale holds AND the deliberate league gaps (NL 12.4 … FR 10.4, `COUNTRY_LEVEL`) survive twenty seasons instead of averaging away.
- **Save v5** (migration 4): old saves become Belgian worlds with `country: 'BE'` everywhere, `nations: []`, `season.europe/nations: null` — they finish their running season without the new competitions; `newSeason` builds whatever the world contains. Nothing half-played is invented.
- **World gen cost**: ~230 ms per generated season (was ~40 domestic) → ~4.5 s for the full 20-year world on a laptop; the new-career progress bar paces itself accordingly. `domesticOnly: true` keeps the small structural test worlds (and the old tests) fast.
- **UI**: the career setup gains a LAND choice (region flavour appears only for Belgium); club select filters to the chosen country; the hub gains EUROPA (bracket by round, user rows highlighted) and LANDEN (nations table + latest internationals) tabs plus country chips on KLASSEMENT to read any league's table; the calendar labels European rounds (`hub.phase.eu-*`). All strings in NL/EN/FR.

## Deliberately cut (and where it would grow)

Foreign leagues have no second tier (no pyramid abroad); nations matches are not watchable (quick-resolved — a "watch the final" would need generated national squads through the engine); no club call-ups/absences for internationals; European qualification in a fresh world is level-seeded because no history exists yet. Each is a clean later step on the same data.

## Verified

`pnpm check` 232 tests green (13 new in `phase12.test.ts`: world shape, per-league champions, the European block inside the break, the nations round robin and points conservation, summary records, per-country standings, determinism across every competition, save migration). Browser-verified end to end on a Dutch career: HC Barenkum picked from 24 Dutch clubs, sim day 13 s with per-fixture progress, the user's European quarter on the calendar as "EU · kwart", German table with German club culture, nations table live.

## Files

Worldgen: `clubs.ts` (country morphologies + name cultures, reserved towns/shorts), `names.ts` (per-country nationality tables), `index.ts`. Season: `model.ts` (Country, NationId, europe/nations on Season, v5 shapes), `world.ts` (multi-league creation, `LEAGUE_COUNTRIES`, `COUNTRY_LEVEL`), `nations.ts` (new), `fixtures.ts` (leagues on one grid, European block, nations schedule), `season.ts` (eu rounds, nations resolution + table, per-league playoffs, summary), `table.ts` (country-scoped standings), `develop.ts` (user-league-pinned normalisation, youth country), `save.ts` (v5), `phase12.test.ts` (new), `season.test.ts`/`lineup.test.ts` (+ insight `scout.test.ts`) on domestic worlds. Manager: `season.worker.ts` (runnerFor + engine-only progress), `stores/season.ts`, `NewCareerView.vue`, `ClubSelectView.vue`, `SeasonHub.vue` (EUROPA/LANDEN panes, country chips), `i18n/{nl,en,fr}.json`. Docs: this file, `KICKOFF.md`.
